import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";
import type { MapNode, ScenarioMap } from "./types";

export const STORAGE_KEY = "crowdwise.scenarioMaps.v1";

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
  if (o.kind === "market") return typeof o.marketId === "string" && (o.side === "yes" || o.side === "no");
  if (o.kind === "input")
    return ["low", "likely", "high"].every((k) => typeof o[k] === "number") && typeof o.source === "string";
  if (o.kind === "formula") {
    if (typeof o.op !== "string" || !Array.isArray(o.refs)) return false;
    if (o.weights !== undefined && (!Array.isArray(o.weights) || !o.weights.every((w) => typeof w === "number" && Number.isFinite(w))))
      return false;
    return true;
  }
  return false;
};

/** Null on anything malformed. A bad link must not take the page down with it. */
export function decodeMap(hash: string): ScenarioMap | null {
  if (!hash) return null;
  try {
    const bytes = fromB64url(hash);
    const json = (() => {
      try { return strFromU8(inflateSync(bytes)); } catch { return strFromU8(bytes); }
    })();
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const m = parsed as Record<string, unknown>;
    if (typeof m.id !== "string" || typeof m.name !== "string" || !Array.isArray(m.nodes)) return null;
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
