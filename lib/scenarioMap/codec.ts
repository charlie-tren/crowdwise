import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";
import { KNOWN_OPERATORS } from "./engine";
import type { MapNode, ScenarioMap } from "./types";

export const STORAGE_KEY = "crowdwise.scenarioMaps.v1";

// fflate's inflateSync has no output-size limit, and deflate can expand
// roughly 1000 to 1: a short, cheaply-crafted hash can demand tens of
// megabytes of JSON, which then hands layoutMap and MapOutline (neither of
// which caps recursion depth) thousands of nodes to lay out and render,
// hanging the tab or overflowing the stack. A bad link must fail cleanly,
// not slowly. These caps are sized generously against a real map - the
// built-ins run to a handful of nodes, and even a large hand-built one is
// unlikely to reach a few dozen - while still keeping worst-case work bounded
// to something that finishes instantly.
const MAX_ENCODED_CHARS = 20_000; // b64url hash length, checked before inflating at all
const MAX_JSON_CHARS = 2_000_000; // decompressed JSON text length (chars), checked before JSON.parse
const MAX_NODES = 500; // parsed node count, checked before anything walks the graph

const toB64url = (b: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string): Uint8Array => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Deflate then base64url. fflate is already a dependency (lib/fedFutures.ts). */
export function encodeMap(map: ScenarioMap): string {
  const rest: ScenarioMap = { ...map };
  delete rest.builtIn;
  return toB64url(deflateSync(strToU8(JSON.stringify(rest))));
}

// Bug fix: the plan's isNode did not check `weights` at all. REF_RULES.mix in
// engine.ts guards weights with `w < 0` and `reduce(...) <= 0`, both loose
// comparisons - a non-numeric or NaN weight (eg. from a hand-edited share link)
// passes that "shape" check because JS coerces it to something that is neither
// negative nor <= 0. evaluateMap then multiplies by it, gets NaN, and clamp01
// silently turns that NaN into 0: a broken mix node displays as a confident
// p50 of zero instead of being marked unresolved. Reject it here instead,
// where the untrusted payload first meets validation. The op/refs checks
// below are left as given: an unknown op or a dangling ref is already caught
// downstream by resolveNodes with a reason, so there is no silent-wrong-figure
// path for those, only a correctly-labelled "unresolved".
const isNode = (n: unknown): n is MapNode => {
  if (!n || typeof n !== "object") return false;
  const o = n as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.label !== "string") return false;
  // Position is common to every kind (it is cosmetic, not part of what a node
  // computes - see the comment on NodePosition in types.ts), so it is checked
  // once here rather than duplicated in each kind's branch below. Same shape
  // of check as override/weights above: a share link is exactly where a
  // hand-edited or corrupted hash would try to smuggle a non-finite or
  // missing coordinate through, and layoutMap's own clamp is defence in
  // depth, not a substitute for rejecting it at the trust boundary.
  if (o.position !== undefined) {
    if (!o.position || typeof o.position !== "object") return false;
    const p = o.position as Record<string, unknown>;
    if (typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y))
      return false;
  }
  if (o.kind === "market") {
    if (typeof o.marketId !== "string" || (o.side !== "yes" && o.side !== "no")) return false;
    // Optional what-if override, in the same 0..1 side-adjusted space as the
    // node's own displayed figure. Same shape of check as the mix weights
    // above - a share link is exactly where a hand-edited or corrupted hash
    // would try to smuggle a non-numeric or out-of-range value through, and
    // engine.ts's own fallback-to-live-price guard is defence in depth, not a
    // substitute for rejecting it here at the trust boundary.
    if (o.override !== undefined && !(typeof o.override === "number" && Number.isFinite(o.override) && o.override >= 0 && o.override <= 1))
      return false;
    return true;
  }
  if (o.kind === "input")
    return ["low", "likely", "high"].every((k) => typeof o[k] === "number") && typeof o.source === "string";
  if (o.kind === "formula") {
    // Restricted to the five real operators, not just "is a string": engine.ts
    // is the authoritative guard against a hostile op (see KNOWN_OPERATORS
    // there for why), but this is the trust boundary, and a payload naming
    // something else is malformed input like any other - reject it here
    // cleanly rather than admit it for the engine to deal with downstream.
    if (typeof o.op !== "string" || !(KNOWN_OPERATORS as string[]).includes(o.op) || !Array.isArray(o.refs))
      return false;
    if (o.weights !== undefined && (!Array.isArray(o.weights) || !o.weights.every((w) => typeof w === "number" && Number.isFinite(w))))
      return false;
    return true;
  }
  return false;
};

/** Null on anything malformed. A bad link must not take the page down with it. */
export function decodeMap(hash: string): ScenarioMap | null {
  if (!hash || hash.length > MAX_ENCODED_CHARS) return null;
  try {
    const bytes = fromB64url(hash);
    const json = (() => {
      try { return strFromU8(inflateSync(bytes)); } catch { return strFromU8(bytes); }
    })();
    if (json.length > MAX_JSON_CHARS) return null;
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const m = parsed as Record<string, unknown>;
    if (typeof m.id !== "string" || typeof m.name !== "string" || !Array.isArray(m.nodes)) return null;
    if (m.nodes.length > MAX_NODES) return null;
    if (!m.nodes.every(isNode)) return null;
    return { id: m.id, name: m.name, nodes: m.nodes as MapNode[] };
  } catch {
    return null;
  }
}

// Every read and write is wrapped: localStorage throws in a private window and
// comes back empty with site data cleared. The page must be correct either way.
export function loadSaved(): ScenarioMap[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ScenarioMap =>
        !!m && typeof m === "object" && Array.isArray((m as ScenarioMap).nodes) && (m as ScenarioMap).nodes.every(isNode),
    );
  } catch {
    return [];
  }
}

export function saveMap(map: ScenarioMap): void {
  try {
    const all = loadSaved().filter((m) => m.id !== map.id);
    const rest: ScenarioMap = { ...map };
    delete rest.builtIn;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...all, rest]));
  } catch {
    /* storage unavailable: the map stays in memory for this session */
  }
}

export function deleteMap(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loadSaved().filter((m) => m.id !== id)));
  } catch {
    /* as above */
  }
}
