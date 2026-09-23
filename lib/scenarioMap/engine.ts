import type { Market } from "@/lib/types";
import type { MapNode, NodeResult, Operator, ScenarioMap } from "./types";
import { makeRng, percentiles, sampleTriangular } from "./rng";

/**
 * Monte Carlo draws. At 4,000 the standard error on a probability near 0.5 is
 * sqrt(0.25 / 4000) = 0.0079, so about 0.8 of a percentage point - under the
 * whole-percent precision the page prints. Raising it buys nothing visible.
 */
export const DRAWS = 4000;

/** Fixed so a re-render never moves a number. See rng.ts. */
export const SEED = 0x5c3a41f0 >>> 0;

export interface Resolution {
  status: "ok" | "unresolved";
  reason?: string;
  /** Set for market nodes only: the constant they contribute to every draw. */
  value?: number;
}

export interface ResolveResult {
  /** Per node id. */
  get(id: string): Resolution | undefined;
  /** Resolvable nodes, inputs before the formulas that read them. */
  order: string[];
}

// A Map, not a plain object literal: `n.op` can arrive verbatim from a share
// link (see codec.ts), and a plain object's lookup falls through to
// Object.prototype for a name like "hasOwnProperty", "valueOf", "toString" or
// "constructor" - resolving to a real inherited function that then gets
// invoked as if it were an operator rule. hasOwnProperty/valueOf throw on the
// call below (crashing the whole page's render, not just this node), toString
// silently returns "[object Undefined]", and constructor returns an array
// into a field the type system says is a string. A Map has no prototype
// chain to fall into: `.get` on an absent key is always exactly undefined,
// for any string at all, which is what makes this the authoritative guard -
// a map built directly in the UI never passes through the codec's validation,
// so this is the only check that protects every path, not just share links.
const REF_RULES = new Map<Operator, (refs: string[], weights?: number[]) => string | null>([
  ["not", (refs) => (refs.length === 1 ? null : "NOT takes exactly one input")],
  ["depends", (refs) =>
    refs.length === 3 ? null : "Depends takes exactly three inputs: the condition and the two conditionals"],
  ["and", (refs) => (refs.length >= 2 ? null : "AND takes at least two inputs")],
  ["or", (refs) => (refs.length >= 2 ? null : "OR takes at least two inputs")],
  ["mix", (refs, weights) => {
    if (!weights || weights.length !== refs.length) return "Mix needs one weight per input";
    if (refs.length < 2) return "Mix takes at least two inputs";
    // Per-weight finiteness first: catches Infinity/NaN individually. This is
    // a different fact from a weight that is finite but negative, so it gets
    // its own reason.
    if (!weights.every((w) => Number.isFinite(w)))
      return "Mix weights must be ordinary numbers, not infinite or not-a-number";
    if (weights.some((w) => w < 0)) return "Mix weights must be positive";
    // Two finite weights can still sum to something non-finite (e.g. two
    // values near the top of double precision). A per-weight check alone
    // does not catch that, so the sum needs its own finiteness check too.
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(sum)) return "Mix weights add up to a number too large to use";
    if (sum <= 0) return "Mix weights must be positive";
    return null;
  }],
]);

/**
 * The five real operator names, derived from REF_RULES so there is one list,
 * not two that can drift apart. codec.ts imports this to reject a formula
 * node's op at the trust boundary, before an untrusted share link's payload
 * is ever admitted as a map.
 */
export const KNOWN_OPERATORS: Operator[] = Array.from(REF_RULES.keys());

export function resolveNodes(map: ScenarioMap, markets: Market[]): ResolveResult {
  const byId = new Map<string, MapNode>(map.nodes.map((n) => [n.id, n]));
  const priceById = new Map<string, number>();
  for (const m of markets) if (m.prob != null) priceById.set(m.id, m.prob);

  const res = new Map<string, Resolution>();

  // Pass 1: the leaves, which need no other node.
  for (const n of map.nodes) {
    if (n.kind === "market") {
      const p = priceById.get(n.marketId);
      if (p == null) {
        res.set(n.id, { status: "unresolved", reason: "No live market on the board" });
      } else if (!Number.isFinite(p)) {
        // Loose `!= null` on the way into priceById does not catch NaN, so a
        // broken price still lands here. This is a different fact from "no
        // market": the market exists but its price cannot be trusted, so say so
        // rather than let it silently become a confident 0 via clamp01.
        res.set(n.id, { status: "unresolved", reason: "Market price is not a usable number" });
      } else {
        res.set(n.id, { status: "ok", value: n.side === "no" ? 1 - p : p });
      }
    } else if (n.kind === "input") {
      const vals = [n.low, n.likely, n.high];
      if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
        res.set(n.id, { status: "unresolved", reason: "Estimates must be between 0 and 1" });
      } else if (!(n.low <= n.likely && n.likely <= n.high)) {
        res.set(n.id, { status: "unresolved", reason: "Needs low, likely, high in order" });
      } else {
        res.set(n.id, { status: "ok" });
      }
    }
  }

  // Pass 2: cycles. Iterative DFS over formula refs, three-colour marking.
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on stack, 2 done
  const inCycle = new Set<string>();
  const visit = (start: string) => {
    const stack: Array<{ id: string; i: number }> = [{ id: start, i: 0 }];
    const path: string[] = [];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const node = byId.get(frame.id);
      if (frame.i === 0) {
        if (state.get(frame.id) === 2) { stack.pop(); continue; }
        // Defensive symmetry with the state-2 check above, not a reachable path:
        // a frame is only ever pushed for an id whose state is undefined (see
        // the push below), and nothing else runs between a push and this frame
        // becoming the top of the stack, so state can never be 1 here.
        if (state.get(frame.id) === 1) { stack.pop(); continue; }
        state.set(frame.id, 1);
        path.push(frame.id);
      }
      const refs = node && node.kind === "formula" ? node.refs : [];
      if (frame.i < refs.length) {
        const next = refs[frame.i++];
        if (state.get(next) === 1) {
          // Everything from `next` to the top of the path is in the cycle
          // currently on the stack. This only fires while `next` is still being
          // explored (state 1). A node that instead reaches `next` after it has
          // already finished (state 2) via a different branch gets no back edge
          // recorded at all, even when it structurally sits on the same cycle:
          // it falls through to whatever downstream reason applies instead of
          // "Circular". That node is still correctly unresolved either way, so
          // no figure is ever wrong, only the stated reason is less precise.
          // Pinned example: the X/Y/Z/W shape in engine.test.ts, where Z shares
          // W with the X/Y/W cycle and reads "Depends on an unresolved input"
          // instead of "Circular".
          for (let k = path.lastIndexOf(next); k >= 0 && k < path.length; k++) inCycle.add(path[k]);
        } else if (state.get(next) !== 2 && byId.has(next)) {
          stack.push({ id: next, i: 0 });
        }
        continue;
      }
      state.set(frame.id, 2);
      path.pop();
      stack.pop();
    }
  };
  for (const n of map.nodes) if (state.get(n.id) !== 2) visit(n.id);

  // Pass 3: formulas, repeated until nothing changes, so a chain settles whatever
  // order the nodes were written in.
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of map.nodes) {
      if (n.kind !== "formula" || res.has(n.id)) continue;
      let r: Resolution | null = null;
      if (inCycle.has(n.id)) {
        r = { status: "unresolved", reason: "Circular: this node feeds itself" };
      } else {
        const rule = REF_RULES.get(n.op);
        const shape = rule ? rule(n.refs, n.weights) : `Unknown operator ${n.op}`;
        if (shape) r = { status: "unresolved", reason: shape };
        else if (n.refs.some((id) => !byId.has(id))) r = { status: "unresolved", reason: "Missing input" };
        else if (n.refs.some((id) => res.get(id)?.status === "unresolved"))
          r = { status: "unresolved", reason: "Depends on an unresolved input" };
        else if (n.refs.every((id) => res.get(id)?.status === "ok")) r = { status: "ok" };
      }
      if (r) { res.set(n.id, r); changed = true; }
    }
  }
  // Anything still unset is downstream of a cycle it is not itself part of.
  for (const n of map.nodes) {
    if (!res.has(n.id)) res.set(n.id, { status: "unresolved", reason: "Depends on an unresolved input" });
  }

  // Topological order over the resolvable nodes.
  const order: string[] = [];
  const placed = new Set<string>();
  const ok = map.nodes.filter((n) => res.get(n.id)?.status === "ok");
  // Safety net, not an expected path: every ok node's refs are themselves ok
  // (pass 3 only marks a formula ok once all its refs already are), so each
  // pass here places at least one new node and the sort finishes in at most
  // ok.length passes. A linear chain is the worst case, needing exactly that
  // many; +1 leaves no room to spare. This guard is not expected to fire.
  let guard = ok.length + 1;
  while (order.length < ok.length && guard-- > 0) {
    for (const n of ok) {
      if (placed.has(n.id)) continue;
      const refs = n.kind === "formula" ? n.refs : [];
      if (refs.every((id) => placed.has(id))) { order.push(n.id); placed.add(n.id); }
    }
  }

  return { get: (id: string) => res.get(id), order };
}

// A plain range clamp, nothing more. It used to also launder a non-finite x
// to 0 (`x < 0 ? 0 : x > 1 ? 1 : x` passes NaN straight through both
// comparisons, and a naive fix that instead special-cased NaN still let
// Infinity clamp to a confident 1). That made every arithmetic accident
// anywhere in the engine come out as a tight, confident, wrong figure with
// nothing to say so - the same shape of bug as the NaN market price, just
// reachable through more paths. The caller (evaluateMap) now checks
// Number.isFinite on the raw value BEFORE this runs, so clamp01 only ever
// sees a value already known finite, and a non-finite value poisons the node
// instead of being clamped into something that looks trustworthy.
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Resolve, then sample. Only resolvable nodes are sampled: an unresolved node's
 * status never changes between draws, so deciding it once is both cheaper and
 * the only way a reason survives to the reader.
 */
export function evaluateMap(
  map: ScenarioMap,
  markets: Market[],
  draws = DRAWS,
): Map<string, NodeResult> {
  const resolved = resolveNodes(map, markets);
  const byId = new Map<string, MapNode>(map.nodes.map((n) => [n.id, n]));
  const samples = new Map<string, number[]>();
  for (const id of resolved.order) samples.set(id, []);

  const rng = makeRng(SEED);
  const draw = new Map<string, number>();
  // A node whose own computed value goes non-finite on any draw is poisoned,
  // and so is any node downstream of it - checked via this set before it
  // reads a ref, so the poison can never be computed away by arithmetic that
  // happens not to reintroduce a finite-looking number. Once poisoned, a
  // node stays poisoned for the rest of the evaluation and reports
  // unresolved, the same as a statically unresolved node. Nodes that are not
  // downstream of the problem never touch this set and are unaffected.
  const poisoned = new Set<string>();

  for (let d = 0; d < draws; d++) {
    for (const id of resolved.order) {
      const n = byId.get(id)!;
      let v: number;
      if (n.kind === "market") {
        v = resolved.get(id)!.value!;
      } else if (n.kind === "input") {
        v = sampleTriangular(n.low, n.likely, n.high, rng());
      } else if (n.refs.some((ref) => poisoned.has(ref))) {
        v = NaN;
      } else {
        const r = n.refs.map((ref) => draw.get(ref)!);
        switch (n.op) {
          case "and": v = r.reduce((acc, p) => acc * p, 1); break;
          case "or": v = 1 - r.reduce((acc, p) => acc * (1 - p), 1); break;
          case "not": v = 1 - r[0]; break;
          case "mix": {
            const w = n.weights!;
            const total = w.reduce((a, b) => a + b, 0);
            v = r.reduce((acc, p, i) => acc + p * w[i], 0) / total;
            break;
          }
          case "depends": v = r[0] * r[1] + (1 - r[0]) * r[2]; break;
          default: v = 0;
        }
      }
      if (!Number.isFinite(v)) {
        poisoned.add(id);
        draw.set(id, NaN);
        continue;
      }
      v = clamp01(v);
      draw.set(id, v);
      // An input node's own reported p50/p10/p90 are computed analytically
      // below, not from this sample - see the output loop. Its draws still
      // land in `draw` above, unchanged, because those are what a formula
      // reading this node multiplies/mixes/etc against; only the reporting
      // path changes, not the feed. Skipping the push here is just not
      // collecting samples nothing will read.
      if (n.kind !== "input") samples.get(id)!.push(v);
    }
  }

  const out = new Map<string, NodeResult>();
  for (const n of map.nodes) {
    const r = resolved.get(n.id)!;
    if (r.status !== "ok") {
      out.set(n.id, { id: n.id, status: "unresolved", reason: r.reason, p50: null, p10: null, p90: null });
      continue;
    }
    if (poisoned.has(n.id)) {
      out.set(n.id, {
        id: n.id,
        status: "unresolved",
        reason: "The calculation did not produce a usable number",
        p50: null, p10: null, p90: null,
      });
      continue;
    }
    if (n.kind === "input") {
      // Closed form, not sampled: a triangular distribution's inverse CDF is
      // exactly sampleTriangular(low, likely, high, u), so the true q-th
      // percentile is that function evaluated at u = q directly, with no
      // Monte Carlo error to report back to a reader as if it were their own
      // typed number. This is what an input node REPORTS; what it FEEDS to
      // formulas above it is unchanged (see the draws loop above, which still
      // draws this node from the seeded sampler for every formula that reads it).
      out.set(n.id, {
        id: n.id,
        status: "ok",
        p50: sampleTriangular(n.low, n.likely, n.high, 0.5),
        p10: sampleTriangular(n.low, n.likely, n.high, 0.1),
        p90: sampleTriangular(n.low, n.likely, n.high, 0.9),
      });
      continue;
    }
    const xs = samples.get(n.id) ?? [];
    // One sort of this node's samples, not three: p50/p10/p90 all come off the
    // same sorted array via `percentiles` instead of each calling `percentile`
    // (which sorts its own copy). See rng.ts. Market nodes are constant, so
    // every sample is identical and this already returns that exact constant -
    // only formula nodes (and market, degenerately) still go through this path.
    const [p50, p10, p90] = percentiles(xs, [0.5, 0.1, 0.9]);
    out.set(n.id, { id: n.id, status: "ok", p50, p10, p90 });
  }
  return out;
}
