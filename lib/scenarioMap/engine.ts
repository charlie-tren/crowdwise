import type { Market } from "@/lib/types";
import type { MapNode, NodeResult, ScenarioMap } from "./types";
import { makeRng, percentile, sampleTriangular } from "./rng";

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

const REF_RULES: Record<string, (refs: string[], weights?: number[]) => string | null> = {
  not: (refs) => (refs.length === 1 ? null : "NOT takes exactly one input"),
  depends: (refs) =>
    refs.length === 3 ? null : "Depends takes exactly three inputs: the condition and the two conditionals",
  and: (refs) => (refs.length >= 2 ? null : "AND takes at least two inputs"),
  or: (refs) => (refs.length >= 2 ? null : "OR takes at least two inputs"),
  mix: (refs, weights) =>
    !weights || weights.length !== refs.length
      ? "Mix needs one weight per input"
      : refs.length < 2
        ? "Mix takes at least two inputs"
        : weights.some((w) => w < 0) || weights.reduce((a, b) => a + b, 0) <= 0
          ? "Mix weights must be positive"
          : null,
};

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
        if (state.get(frame.id) === 1) { stack.pop(); continue; }
        state.set(frame.id, 1);
        path.push(frame.id);
      }
      const refs = node && node.kind === "formula" ? node.refs : [];
      if (frame.i < refs.length) {
        const next = refs[frame.i++];
        if (state.get(next) === 1) {
          // Everything from `next` to the top of the path is in the cycle.
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
        const rule = REF_RULES[n.op];
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

// NaN-safe on purpose: `x < 0 ? 0 : x > 1 ? 1 : x` passes NaN straight through,
// because both comparisons are false for it. A single NaN then reaches percentile,
// where it corrupts the sort (a comparator returning NaN leaves the array in an
// arbitrary order) and the figure comes out wrong with nothing to say so. The
// input validation in resolveNodes should make this unreachable; this is the
// backstop for when it is not.
const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

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

  for (let d = 0; d < draws; d++) {
    for (const id of resolved.order) {
      const n = byId.get(id)!;
      let v: number;
      if (n.kind === "market") {
        v = resolved.get(id)!.value!;
      } else if (n.kind === "input") {
        v = sampleTriangular(n.low, n.likely, n.high, rng());
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
      v = clamp01(v);
      draw.set(id, v);
      samples.get(id)!.push(v);
    }
  }

  const out = new Map<string, NodeResult>();
  for (const n of map.nodes) {
    const r = resolved.get(n.id)!;
    if (r.status !== "ok") {
      out.set(n.id, { id: n.id, status: "unresolved", reason: r.reason, p50: null, p10: null, p90: null });
      continue;
    }
    const xs = samples.get(n.id) ?? [];
    out.set(n.id, {
      id: n.id,
      status: "ok",
      p50: percentile(xs, 0.5),
      p10: percentile(xs, 0.1),
      p90: percentile(xs, 0.9),
    });
  }
  return out;
}
