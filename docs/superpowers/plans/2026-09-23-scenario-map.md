# Scenario Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat market picker on `/scenario` with a map of nodes whose arrows are formulas, so a macro view can be built from live market prices, typed estimates and conditional probabilities.

**Architecture:** A pure `lib/scenarioMap/` layer (types, seeded RNG, engine, layout, codec, built-ins) with no React and no network, and a `components/scenarioMap/` layer that renders it. The engine resolves nodes statically, then runs a seeded Monte Carlo so ranges propagate and the same map always draws the same numbers. Layout is a pure function from a map to pixel positions, so the picture is derived from the formulas and there is nothing to keep in step. The page stays statically prerendered.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, Vitest + jsdom + Testing Library, `fflate` (already a dependency, used here to compress share links).

**Spec:** `docs/superpowers/specs/2026-09-23-scenario-map-design.md`. Read it before Task 1.

**Path note:** all paths are relative to the repo root `C:\Users\charl\OneDrive\Documents\crowdwise`. The branch is `master`, not `main`. Other sessions push to this repo, so `git pull --ff-only` before you start and never `git add -A`: stage explicit paths only.

---

## File structure (locked before tasks)

```
lib/scenarioMap/
  types.ts        # ScenarioMap, MapNode (market | input | formula), Operator, NodeResult
  rng.ts          # makeRng (mulberry32), sampleTriangular, percentile
  engine.ts       # resolveNodes (static pass + cycles), evaluateMap (Monte Carlo)
  layout.ts       # layoutMap: pure map -> {nodes, edges, width, height}
  codec.ts        # encodeMap/decodeMap (share hash), loadSaved/saveMap (localStorage)
  builtins.ts     # builtInMaps: the four theses as maps, resolved against the board
components/scenarioMap/
  ScenarioMap.tsx # client container: chips, state, storage, share
  MapView.tsx     # SVG picture, >= 640px only, measures its own container
  MapOutline.tsx  # indented outline, < 640px
  NodeList.tsx    # one row per node + inline editors
app/scenario/page.tsx   # modified: renders ScenarioMap instead of the old two
```

Deleted at the end: `components/ScenarioBuilder.tsx`, `components/ScenarioBuilder.test.tsx`, `components/ThesisBaskets.tsx`. `lib/thesis.ts` and `lib/scenario.ts` both stay: `builtins.ts` reads `THESES`, and `lib/scenario.ts` is still imported by `lib/thesis.ts`.

---

### Task 1: Types and the seeded RNG

**Files:**
- Create: `lib/scenarioMap/types.ts`
- Create: `lib/scenarioMap/rng.ts`
- Test: `lib/scenarioMap/rng.test.ts`

- [ ] **Step 1: Write the types**

Create `lib/scenarioMap/types.ts`:

```ts
// A map is a set of nodes. There are no edge objects: a formula node names the
// ids it reads, and the arrows on screen are derived from those names. That is
// the whole reason this is not a free canvas - there is no second structure that
// can disagree with the maths.

export type Operator = "and" | "or" | "not" | "mix" | "depends";

export interface MarketNode {
  id: string;
  kind: "market";
  label: string;
  marketId: string;      // Market.id from the board; "" when a leg has no market
  side: "yes" | "no";
}

export interface InputNode {
  id: string;
  kind: "input";
  label: string;
  low: number;           // 0..1
  likely: number;        // 0..1
  high: number;          // 0..1
  source: string;        // "Charlie", "3 of 12 post-war cycles", a URL
}

export interface FormulaNode {
  id: string;
  kind: "formula";
  label: string;
  op: Operator;
  // For "depends" the order is [condition, ifConditionYes, ifConditionNo].
  // For "not" there is exactly one ref.
  refs: string[];
  weights?: number[];    // "mix" only, same length as refs
}

export type MapNode = MarketNode | InputNode | FormulaNode;

export interface ScenarioMap {
  id: string;
  name: string;
  nodes: MapNode[];
  builtIn?: boolean;
}

export interface NodeResult {
  id: string;
  status: "ok" | "unresolved";
  reason?: string;       // set when unresolved, shown to the reader
  p50: number | null;
  p10: number | null;
  p90: number | null;
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/scenarioMap/rng.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeRng, sampleTriangular, percentile } from "./rng";

describe("makeRng", () => {
  it("is deterministic for a seed", () => {
    const a = makeRng(42), b = makeRng(42);
    const runA = [a(), a(), a()];
    const runB = [b(), b(), b()];
    expect(runA).toEqual(runB);
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });

  it("stays inside [0,1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("sampleTriangular", () => {
  it("returns the point when low = likely = high", () => {
    const r = makeRng(1);
    expect(sampleTriangular(0.3, 0.3, 0.3, r())).toBeCloseTo(0.3);
  });

  it("stays within the bounds", () => {
    const r = makeRng(3);
    for (let i = 0; i < 2000; i++) {
      const v = sampleTriangular(0.2, 0.25, 0.6, r());
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThanOrEqual(0.6);
    }
  });

  it("has mean (low + likely + high) / 3", () => {
    const r = makeRng(11);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += sampleTriangular(0.2, 0.25, 0.6, r());
    expect(sum / n).toBeCloseTo((0.2 + 0.25 + 0.6) / 3, 2);
  });
});

describe("percentile", () => {
  it("reads the nearest rank on a sorted copy", () => {
    const xs = [5, 1, 4, 2, 3];
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 1)).toBe(5);
    expect(percentile(xs, 0.5)).toBe(3);
  });

  it("returns null for an empty sample", () => {
    expect(percentile([], 0.5)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- lib/scenarioMap/rng.test.ts`
Expected: FAIL, cannot resolve `./rng`.

- [ ] **Step 4: Write the implementation**

Create `lib/scenarioMap/rng.ts`:

```ts
// A SEEDED generator, not Math.random, so a map always draws the same numbers.
// Without this the percentiles shift by a few tenths on every re-render and a
// reader watching a figure twitch reads it as the market moving.

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Inverse-CDF sample from a triangular distribution over (low, likely, high),
 * given one uniform draw `u`. Triangular because it is the distribution a person
 * can actually state: a floor, a ceiling and a best guess. It degenerates to a
 * point estimate when the three are equal, so a point needs no special case.
 */
export function sampleTriangular(low: number, likely: number, high: number, u: number): number {
  const span = high - low;
  if (span <= 0) return low;
  const cut = (likely - low) / span;
  if (u < cut) return low + Math.sqrt(u * span * (likely - low));
  return high - Math.sqrt((1 - u) * span * (high - likely));
}

/** Nearest-rank percentile. Sorts a copy; `xs` is not mutated. */
export function percentile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const i = Math.round(q * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, i))];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- lib/scenarioMap/rng.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/scenarioMap/types.ts lib/scenarioMap/rng.ts lib/scenarioMap/rng.test.ts
git commit -m "Scenario map: node types and a seeded triangular sampler"
```

---

### Task 2: Static resolution and cycle detection

The engine runs in two halves. This task is the first: decide which nodes can produce a number at all, and why the others cannot. Doing it statically means a broken leg names its own reason and every other node still shows a value.

**Files:**
- Create: `lib/scenarioMap/engine.ts`
- Test: `lib/scenarioMap/engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/scenarioMap/engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveNodes } from "./engine";
import type { ScenarioMap } from "./types";
import type { Market } from "@/lib/types";

const mk = (id: string, prob: number | null): Market => ({
  id, platform: "Kalshi", title: id, category: "Rates/Fed", prob, volume: 100,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

const map = (...nodes: ScenarioMap["nodes"]): ScenarioMap => ({ id: "m", name: "m", nodes });

describe("resolveNodes", () => {
  it("resolves a market node to its side-adjusted price", () => {
    const r = resolveNodes(
      map({ id: "a", kind: "market", label: "A", marketId: "k1", side: "no" }),
      [mk("k1", 0.3)],
    );
    expect(r.get("a")!.status).toBe("ok");
    expect(r.get("a")!.value).toBeCloseTo(0.7);
  });

  it("marks a market node unresolved when the board has no such market", () => {
    const r = resolveNodes(
      map({ id: "a", kind: "market", label: "A", marketId: "gone", side: "yes" }),
      [mk("k1", 0.3)],
    );
    expect(r.get("a")!.status).toBe("unresolved");
    expect(r.get("a")!.reason).toMatch(/no live market/i);
  });

  it("marks an input unresolved when the range is out of order", () => {
    const r = resolveNodes(
      map({ id: "i", kind: "input", label: "I", low: 0.6, likely: 0.2, high: 0.4, source: "x" }),
      [],
    );
    expect(r.get("i")!.status).toBe("unresolved");
    expect(r.get("i")!.reason).toMatch(/low, likely, high/i);
  });

  it("marks an input unresolved when it is outside 0 to 1", () => {
    const r = resolveNodes(
      map({ id: "i", kind: "input", label: "I", low: 0.2, likely: 0.5, high: 1.4, source: "x" }),
      [],
    );
    expect(r.get("i")!.status).toBe("unresolved");
    expect(r.get("i")!.reason).toMatch(/between 0 and 1/i);
  });

  it("marks a formula unresolved when a ref names nothing", () => {
    const r = resolveNodes(
      map(
        { id: "i", kind: "input", label: "I", low: 0.5, likely: 0.5, high: 0.5, source: "x" },
        { id: "f", kind: "formula", label: "F", op: "and", refs: ["i", "ghost"] },
      ),
      [],
    );
    expect(r.get("f")!.status).toBe("unresolved");
    expect(r.get("f")!.reason).toMatch(/missing input/i);
  });

  it("propagates unresolved downstream", () => {
    const r = resolveNodes(
      map(
        { id: "a", kind: "market", label: "A", marketId: "gone", side: "yes" },
        { id: "b", kind: "input", label: "B", low: 0.5, likely: 0.5, high: 0.5, source: "x" },
        { id: "f", kind: "formula", label: "F", op: "and", refs: ["a", "b"] },
        { id: "g", kind: "formula", label: "G", op: "not", refs: ["f"] },
      ),
      [],
    );
    expect(r.get("b")!.status).toBe("ok");        // a sibling still resolves
    expect(r.get("f")!.reason).toMatch(/unresolved input/i);
    expect(r.get("g")!.reason).toMatch(/unresolved input/i);
  });

  it("flags every node in a cycle rather than throwing", () => {
    const r = resolveNodes(
      map(
        { id: "f", kind: "formula", label: "F", op: "not", refs: ["g"] },
        { id: "g", kind: "formula", label: "G", op: "not", refs: ["f"] },
      ),
      [],
    );
    expect(r.get("f")!.reason).toMatch(/circular/i);
    expect(r.get("g")!.reason).toMatch(/circular/i);
  });

  it("rejects the wrong number of refs per operator", () => {
    const r = resolveNodes(
      map(
        { id: "i", kind: "input", label: "I", low: 0.5, likely: 0.5, high: 0.5, source: "x" },
        { id: "n", kind: "formula", label: "N", op: "not", refs: ["i", "i"] },
        { id: "d", kind: "formula", label: "D", op: "depends", refs: ["i", "i"] },
        { id: "w", kind: "formula", label: "W", op: "mix", refs: ["i"], weights: [1, 2] },
      ),
      [],
    );
    expect(r.get("n")!.reason).toMatch(/exactly one/i);
    expect(r.get("d")!.reason).toMatch(/exactly three/i);
    expect(r.get("w")!.reason).toMatch(/one weight/i);
  });

  it("returns a topological order with inputs before the formulas that read them", () => {
    const m = map(
      { id: "f", kind: "formula", label: "F", op: "and", refs: ["a", "b"] },
      { id: "a", kind: "input", label: "A", low: 0.5, likely: 0.5, high: 0.5, source: "x" },
      { id: "b", kind: "input", label: "B", low: 0.5, likely: 0.5, high: 0.5, source: "x" },
    );
    const order = resolveNodes(m, []).order;
    expect(order.indexOf("f")).toBeGreaterThan(order.indexOf("a"));
    expect(order.indexOf("f")).toBeGreaterThan(order.indexOf("b"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/scenarioMap/engine.test.ts`
Expected: FAIL, cannot resolve `./engine`.

- [ ] **Step 3: Write the implementation**

Create `lib/scenarioMap/engine.ts`:

```ts
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
  // Weights first: a mismatched weight count is the more specific fault, and
  // checking arity first hides it behind "takes at least two inputs".
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
        // NOT `REF_RULES[n.op]?.(...) ?? "Unknown operator"`: a rule returns null
        // to mean "this shape is fine", and ?? fires on null as well as undefined,
        // so every valid operator would report itself unknown.
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/scenarioMap/engine.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/scenarioMap/engine.ts lib/scenarioMap/engine.test.ts
git commit -m "Scenario map: static resolution, so a broken leg names its own reason"
```

---

### Task 3: Monte Carlo evaluation

**Files:**
- Modify: `lib/scenarioMap/engine.ts` (append `evaluateMap`)
- Modify: `lib/scenarioMap/engine.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

Extend the existing import at the top of `lib/scenarioMap/engine.test.ts` so it reads:

```ts
import { resolveNodes, evaluateMap } from "./engine";
```

Then append to the same file:

```ts
const point = (id: string, p: number): ScenarioMap["nodes"][number] =>
  ({ id, kind: "input", label: id, low: p, likely: p, high: p, source: "test" });

describe("evaluateMap", () => {
  it("AND is the product", () => {
    const r = evaluateMap(
      map(point("a", 0.5), point("b", 0.4), { id: "f", kind: "formula", label: "F", op: "and", refs: ["a", "b"] }),
      [],
    );
    expect(r.get("f")!.p50).toBeCloseTo(0.2, 6);
  });

  it("OR is one minus the product of complements", () => {
    const r = evaluateMap(
      map(point("a", 0.5), point("b", 0.4), { id: "f", kind: "formula", label: "F", op: "or", refs: ["a", "b"] }),
      [],
    );
    expect(r.get("f")!.p50).toBeCloseTo(0.7, 6);
  });

  it("NOT is one minus its input", () => {
    const r = evaluateMap(
      map(point("a", 0.3), { id: "f", kind: "formula", label: "F", op: "not", refs: ["a"] }),
      [],
    );
    expect(r.get("f")!.p50).toBeCloseTo(0.7, 6);
  });

  it("MIX is the weighted average", () => {
    const r = evaluateMap(
      map(point("a", 0.2), point("b", 0.6),
        { id: "f", kind: "formula", label: "F", op: "mix", refs: ["a", "b"], weights: [3, 1] }),
      [],
    );
    expect(r.get("f")!.p50).toBeCloseTo(0.3, 6); // (0.2*3 + 0.6*1) / 4
  });

  it("DEPENDS is the law of total probability", () => {
    // P = 0.25*0.8 + 0.75*0.1 = 0.2 + 0.075 = 0.275
    const r = evaluateMap(
      map(point("cond", 0.25), point("yes", 0.8), point("no", 0.1),
        { id: "f", kind: "formula", label: "F", op: "depends", refs: ["cond", "yes", "no"] }),
      [],
    );
    expect(r.get("f")!.p50).toBeCloseTo(0.275, 6);
  });

  it("carries a range through a formula", () => {
    const r = evaluateMap(
      map(
        { id: "a", kind: "input", label: "A", low: 0.2, likely: 0.5, high: 0.8, source: "x" },
        { id: "f", kind: "formula", label: "F", op: "not", refs: ["a"] },
      ),
      [],
    );
    const a = r.get("a")!, f = r.get("f")!;
    expect(a.p10!).toBeLessThan(a.p50!);
    expect(a.p90!).toBeGreaterThan(a.p50!);
    // NOT flips the order of the percentiles, so the width survives.
    expect(f.p90! - f.p10!).toBeCloseTo(a.p90! - a.p10!, 2);
  });

  it("gives an unresolved node null figures and keeps its siblings", () => {
    const r = evaluateMap(
      map(
        point("good", 0.4),
        { id: "bad", kind: "market", label: "B", marketId: "gone", side: "yes" },
        { id: "f", kind: "formula", label: "F", op: "and", refs: ["good", "bad"] },
      ),
      [],
    );
    expect(r.get("good")!.p50).toBeCloseTo(0.4, 6);
    expect(r.get("bad")!.status).toBe("unresolved");
    expect(r.get("bad")!.p50).toBeNull();
    expect(r.get("f")!.p50).toBeNull();
  });

  it("is reproducible", () => {
    const m = map(
      { id: "a", kind: "input", label: "A", low: 0.1, likely: 0.4, high: 0.9, source: "x" },
      { id: "f", kind: "formula", label: "F", op: "not", refs: ["a"] },
    );
    expect(evaluateMap(m, []).get("f")!.p50).toBe(evaluateMap(m, []).get("f")!.p50);
  });

  it("never lets a non-finite value reach a percentile", () => {
    // An out-of-order range is rejected by resolveNodes, so reach the clamp the
    // only other way: a market whose price is already broken.
    const bad = [{
      id: "k1", platform: "Kalshi" as const, title: "x", category: "Rates/Fed" as const,
      prob: Number.NaN, volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "",
    }];
    const r = evaluateMap(
      map({ id: "m", kind: "market", label: "M", marketId: "k1", side: "yes" }),
      bad,
    );
    const v = r.get("m")!;
    expect(v.p50 == null || Number.isFinite(v.p50)).toBe(true);
  });

  it("keeps every result inside 0 to 1", () => {
    const r = evaluateMap(
      map(
        { id: "a", kind: "input", label: "A", low: 0, likely: 0.5, high: 1, source: "x" },
        { id: "b", kind: "input", label: "B", low: 0, likely: 0.5, high: 1, source: "x" },
        { id: "f", kind: "formula", label: "F", op: "or", refs: ["a", "b"] },
      ),
      [],
    );
    for (const id of ["a", "b", "f"]) {
      expect(r.get(id)!.p10!).toBeGreaterThanOrEqual(0);
      expect(r.get(id)!.p90!).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/scenarioMap/engine.test.ts`
Expected: FAIL, `evaluateMap` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/scenarioMap/engine.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/scenarioMap/engine.test.ts`
Expected: PASS, 19 tests total in the file (9 from Task 2, 10 here).

- [ ] **Step 5: Commit**

```bash
git add lib/scenarioMap/engine.ts lib/scenarioMap/engine.test.ts
git commit -m "Scenario map: seeded Monte Carlo so ranges propagate through the formulas"
```

---

### Task 4: The four built-in maps

**Files:**
- Create: `lib/scenarioMap/builtins.ts`
- Test: `lib/scenarioMap/builtins.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/scenarioMap/builtins.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { builtInMaps } from "./builtins";
import { evaluateMap } from "./engine";
import { THESES } from "@/lib/thesis";
import type { Market } from "@/lib/types";

const mk = (id: string, title: string, category: Market["category"], prob: number): Market => ({
  id, platform: "Kalshi", title, category, prob, volume: 1000,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

// Titles chosen to satisfy the leg predicates in lib/thesis.ts.
const board: Market[] = [
  mk("rec", "Will the US enter a recession in 2026?", "Growth/Recession", 0.3),
  mk("cut", "Fed cut rates before 2027", "Rates/Fed", 0.8),
  mk("nocut", "No Fed rate cuts in 2026", "Rates/Fed", 0.15),
  mk("unemp", "Will unemployment reach 5% in 2026?", "Growth/Recession", 0.25),
];

describe("builtInMaps", () => {
  it("returns one map per thesis, each marked built in", () => {
    const maps = builtInMaps(board);
    expect(maps).toHaveLength(THESES.length);
    expect(maps.every((m) => m.builtIn)).toBe(true);
  });

  it("gives every map a combined node reading AND over its legs", () => {
    for (const m of builtInMaps(board)) {
      const combined = m.nodes.filter((n) => n.kind === "formula");
      expect(combined).toHaveLength(1);
      expect(combined[0]).toMatchObject({ op: "and" });
      expect(combined[0].id).toBe(`${m.id}-combined`);
    }
  });

  it("reproduces the thesis joint probability", () => {
    // "Recession in 2026" is recession YES (0.3) and Fed cuts YES (0.8) = 0.24.
    const m = builtInMaps(board).find((x) => x.id === "recession")!;
    const r = evaluateMap(m, board);
    expect(r.get("recession-combined")!.p50).toBeCloseTo(0.24, 6);
  });

  it("takes the NO side where the thesis leg says no", () => {
    // "Soft landing" is recession NO (0.7) and Fed cuts YES (0.8) = 0.56.
    const m = builtInMaps(board).find((x) => x.id === "soft-landing")!;
    const r = evaluateMap(m, board);
    expect(r.get("soft-landing-combined")!.p50).toBeCloseTo(0.56, 6);
  });

  it("hardcodes no market ids: a different board gives different prices", () => {
    const moved = board.map((m) => (m.id === "rec" ? { ...m, id: "rec2" } : m));
    const m = builtInMaps(moved).find((x) => x.id === "recession")!;
    expect(m.nodes.some((n) => n.kind === "market" && n.marketId === "rec2")).toBe(true);
  });

  it("leaves a leg with no market unresolved and still resolves its sibling", () => {
    const thin = board.filter((m) => m.id !== "rec");
    const m = builtInMaps(thin).find((x) => x.id === "recession")!;
    const r = evaluateMap(m, thin);
    const legs = m.nodes.filter((n) => n.kind === "market");
    const statuses = legs.map((n) => r.get(n.id)!.status);
    expect(statuses).toContain("unresolved");
    expect(statuses).toContain("ok");
    expect(r.get("recession-combined")!.status).toBe("unresolved");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/scenarioMap/builtins.test.ts`
Expected: FAIL, cannot resolve `./builtins`.

- [ ] **Step 3: Write the implementation**

Create `lib/scenarioMap/builtins.ts`:

```ts
import { resolveThesis, THESES } from "@/lib/thesis";
import type { Market } from "@/lib/types";
import type { MapNode, ScenarioMap } from "./types";

/**
 * The four theses as maps. The legs are resolved through lib/thesis.ts's own
 * predicates at render time, so no market id is ever written down here: ids churn
 * and a map that hardcoded one would quietly go blank.
 *
 * A leg with no market becomes a market node with an empty marketId, which the
 * engine reports as "No live market on the board". That is deliberate: a partial
 * map showing three of four legs beats a map that hides itself.
 */
export function builtInMaps(markets: Market[]): ScenarioMap[] {
  return THESES.map((thesis) => {
    const resolved = resolveThesis(thesis, markets);
    const legNodes: MapNode[] = resolved.legs.map((leg, i) => ({
      id: `${thesis.key}-leg-${i}`,
      kind: "market",
      label: leg.label,
      marketId: leg.market?.id ?? "",
      side: leg.side,
    }));
    const combined: MapNode = {
      id: `${thesis.key}-combined`,
      kind: "formula",
      label: thesis.name,
      op: "and",
      refs: legNodes.map((n) => n.id),
    };
    return { id: thesis.key, name: thesis.name, nodes: [...legNodes, combined], builtIn: true };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/scenarioMap/builtins.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/scenarioMap/builtins.ts lib/scenarioMap/builtins.test.ts
git commit -m "Scenario map: the four theses become the built-in maps"
```

---

### Task 5: Layout

**Files:**
- Create: `lib/scenarioMap/layout.ts`
- Test: `lib/scenarioMap/layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/scenarioMap/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { layoutMap, NODE_W, NODE_H } from "./layout";
import type { ScenarioMap } from "./types";

const input = (id: string) =>
  ({ id, kind: "input", label: id, low: 0.5, likely: 0.5, high: 0.5, source: "x" }) as const;

const diamond: ScenarioMap = {
  id: "d", name: "d",
  nodes: [
    input("a"),
    { id: "l", kind: "formula", label: "L", op: "not", refs: ["a"] },
    { id: "r", kind: "formula", label: "R", op: "not", refs: ["a"] },
    { id: "top", kind: "formula", label: "T", op: "and", refs: ["l", "r"] },
  ],
};

describe("layoutMap", () => {
  it("puts a leaf in layer 0 and each formula one layer past its deepest input", () => {
    const l = layoutMap(diamond, 900);
    const layer = (id: string) => l.nodes.find((n) => n.id === id)!.layer;
    expect(layer("a")).toBe(0);
    expect(layer("l")).toBe(1);
    expect(layer("r")).toBe(1);
    expect(layer("top")).toBe(2);
  });

  it("places a node to the right of every node it reads", () => {
    const l = layoutMap(diamond, 900);
    const x = (id: string) => l.nodes.find((n) => n.id === id)!.x;
    expect(x("top")).toBeGreaterThan(x("l"));
    expect(x("l")).toBeGreaterThan(x("a"));
  });

  it("separates nodes sharing a layer by at least the node height", () => {
    const l = layoutMap(diamond, 900);
    const ys = l.nodes.filter((n) => n.layer === 1).map((n) => n.y).sort((p, q) => p - q);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(NODE_H);
  });

  it("emits one edge per ref, pointing from the input to the reader", () => {
    const l = layoutMap(diamond, 900);
    expect(l.edges).toHaveLength(4); // a->l, a->r, l->top, r->top
    expect(l.edges.every((e) => e.path.startsWith("M"))).toBe(true);
    expect(l.edges.some((e) => e.from === "a" && e.to === "l")).toBe(true);
  });

  it("is deterministic and independent of node order in the array", () => {
    const shuffled: ScenarioMap = { ...diamond, nodes: [...diamond.nodes].reverse() };
    const a = layoutMap(diamond, 900).nodes.map((n) => `${n.id}:${n.layer}`).sort();
    const b = layoutMap(shuffled, 900).nodes.map((n) => `${n.id}:${n.layer}`).sort();
    expect(a).toEqual(b);
  });

  it("keeps every node inside the reported canvas", () => {
    const l = layoutMap(diamond, 900);
    for (const n of l.nodes) {
      expect(n.x - NODE_W / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + NODE_W / 2).toBeLessThanOrEqual(l.width);
      expect(n.y - NODE_H / 2).toBeGreaterThanOrEqual(0);
      expect(n.y + NODE_H / 2).toBeLessThanOrEqual(l.height);
    }
  });

  it("drops a ref that names nothing rather than drawing an edge to nowhere", () => {
    const broken: ScenarioMap = {
      id: "b", name: "b",
      nodes: [input("a"), { id: "f", kind: "formula", label: "F", op: "and", refs: ["a", "ghost"] }],
    };
    const l = layoutMap(broken, 900);
    expect(l.edges).toHaveLength(1);
    expect(l.nodes).toHaveLength(2);
  });

  it("handles a cycle without looping forever", () => {
    const cyclic: ScenarioMap = {
      id: "c", name: "c",
      nodes: [
        { id: "f", kind: "formula", label: "F", op: "not", refs: ["g"] },
        { id: "g", kind: "formula", label: "G", op: "not", refs: ["f"] },
      ],
    };
    const l = layoutMap(cyclic, 900);
    expect(l.nodes).toHaveLength(2);
    expect(l.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/scenarioMap/layout.test.ts`
Expected: FAIL, cannot resolve `./layout`.

- [ ] **Step 3: Write the implementation**

Create `lib/scenarioMap/layout.ts`:

```ts
import type { ScenarioMap } from "./types";

// Box geometry in CSS pixels. Positions below are CENTRES.
export const NODE_W = 168;
export const NODE_H = 56;
const GAP_X = 56;
const GAP_Y = 22;
const PAD = 8;

export interface LayoutNode { id: string; x: number; y: number; layer: number }
export interface LayoutEdge { from: string; to: string; path: string }
export interface MapLayout { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number }

/**
 * Layered left to right, ordered within a layer by the barycentre of each node's
 * inputs so edges cross as little as possible.
 *
 * Positions are in CONTAINER pixels, never a fixed viewBox scaled to fit: scaling
 * a wide viewBox into a phone shrinks every label with it, which is how this
 * estate has shipped 4px axis text before.
 */
export function layoutMap(map: ScenarioMap, width: number): MapLayout {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const refsOf = (id: string): string[] => {
    const n = byId.get(id);
    return n && n.kind === "formula" ? n.refs.filter((r) => byId.has(r)) : [];
  };

  // Longest path from the leaves. `seen` breaks a cycle by treating the repeat
  // as a leaf, so a half-built map still draws.
  const layerCache = new Map<string, number>();
  const layerOf = (id: string, seen: Set<string>): number => {
    if (layerCache.has(id)) return layerCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const refs = refsOf(id);
    const l = refs.length ? 1 + Math.max(...refs.map((r) => layerOf(r, seen))) : 0;
    seen.delete(id);
    layerCache.set(id, l);
    return l;
  };
  const layers = new Map<string, number>();
  for (const n of map.nodes) layers.set(n.id, layerOf(n.id, new Set()));

  const maxLayer = Math.max(0, ...layers.values());
  const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  // Sort by id first so the result never depends on the order of the array.
  for (const n of [...map.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    columns[layers.get(n.id)!].push(n.id);
  }

  // Barycentre ordering: each column follows the mean position of its inputs in
  // the column before it. Column 0 keeps its id order.
  for (let c = 1; c < columns.length; c++) {
    const prevIndex = new Map(columns[c - 1].map((id, i) => [id, i]));
    const key = new Map<string, number>();
    columns[c].forEach((id, i) => {
      const positions = refsOf(id).map((r) => prevIndex.get(r)).filter((v): v is number => v != null);
      key.set(id, positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : i);
    });
    columns[c].sort((a, b) => key.get(a)! - key.get(b)! || a.localeCompare(b));
  }

  const tallest = Math.max(1, ...columns.map((col) => col.length));
  const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * GAP_Y;
  const canvasW = Math.max(width, PAD * 2 + columns.length * NODE_W + (columns.length - 1) * GAP_X);

  const nodes: LayoutNode[] = [];
  const pos = new Map<string, LayoutNode>();
  columns.forEach((col, c) => {
    const colHeight = col.length * NODE_H + (col.length - 1) * GAP_Y;
    const top = (height - colHeight) / 2;
    col.forEach((id, i) => {
      const node: LayoutNode = {
        id,
        x: PAD + NODE_W / 2 + c * (NODE_W + GAP_X),
        y: top + NODE_H / 2 + i * (NODE_H + GAP_Y),
        layer: c,
      };
      nodes.push(node);
      pos.set(id, node);
    });
  });

  const edges: LayoutEdge[] = [];
  for (const n of map.nodes) {
    for (const ref of refsOf(n.id)) {
      const from = pos.get(ref)!, to = pos.get(n.id)!;
      const x1 = from.x + NODE_W / 2, x2 = to.x - NODE_W / 2;
      const mid = (x1 + x2) / 2;
      edges.push({
        from: ref,
        to: n.id,
        path: `M ${x1} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${x2} ${to.y}`,
      });
    }
  }

  return { nodes, edges, width: canvasW, height };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/scenarioMap/layout.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/scenarioMap/layout.ts lib/scenarioMap/layout.test.ts
git commit -m "Scenario map: derive the picture from the formulas"
```

---

### Task 6: Codec for sharing and storage

**Files:**
- Create: `lib/scenarioMap/codec.ts`
- Test: `lib/scenarioMap/codec.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/scenarioMap/codec.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { encodeMap, decodeMap, loadSaved, saveMap, deleteMap, STORAGE_KEY } from "./codec";
import type { ScenarioMap } from "./types";

const full: ScenarioMap = {
  id: "mine", name: "My map",
  nodes: [
    { id: "m1", kind: "market", label: "Fed cuts", marketId: "KX-1", side: "no" },
    { id: "i1", kind: "input", label: "My read", low: 0.2, likely: 0.35, high: 0.6, source: "Charlie" },
    { id: "f1", kind: "formula", label: "Both", op: "and", refs: ["m1", "i1"] },
    { id: "f2", kind: "formula", label: "Blend", op: "mix", refs: ["m1", "i1"], weights: [2, 1] },
    { id: "f3", kind: "formula", label: "Given", op: "depends", refs: ["m1", "i1", "f1"] },
  ],
};

describe("encodeMap / decodeMap", () => {
  it("round-trips every node kind", () => {
    expect(decodeMap(encodeMap(full))).toEqual(full);
  });

  it("emits a URL-safe string with no padding", () => {
    expect(encodeMap(full)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns null for rubbish rather than throwing", () => {
    expect(decodeMap("not-a-real-hash")).toBeNull();
    expect(decodeMap("")).toBeNull();
  });

  it("returns null when the payload decodes but is not a map", () => {
    expect(decodeMap(encodeMap({ id: "x", name: "x", nodes: [] } as ScenarioMap))).not.toBeNull();
    expect(decodeMap(btoa('{"nope":1}').replace(/=+$/, ""))).toBeNull();
  });

  it("drops the builtIn flag, because a shared copy is the reader's own", () => {
    const shared = decodeMap(encodeMap({ ...full, builtIn: true }))!;
    expect(shared.builtIn).toBeUndefined();
  });
});

describe("localStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts empty", () => expect(loadSaved()).toEqual([]));

  it("saves and reads back", () => {
    saveMap(full);
    expect(loadSaved()).toEqual([full]);
  });

  it("replaces a map with the same id rather than duplicating it", () => {
    saveMap(full);
    saveMap({ ...full, name: "Renamed" });
    const all = loadSaved();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Renamed");
  });

  it("deletes by id", () => {
    saveMap(full);
    deleteMap(full.id);
    expect(loadSaved()).toEqual([]);
  });

  it("returns an empty list when the stored value is corrupt", () => {
    window.localStorage.setItem(STORAGE_KEY, "{{{");
    expect(loadSaved()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/scenarioMap/codec.test.ts`
Expected: FAIL, cannot resolve `./codec`.

- [ ] **Step 3: Write the implementation**

Create `lib/scenarioMap/codec.ts`:

```ts
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

const isNode = (n: unknown): n is MapNode => {
  if (!n || typeof n !== "object") return false;
  const o = n as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.label !== "string") return false;
  if (o.kind === "market") return typeof o.marketId === "string" && (o.side === "yes" || o.side === "no");
  if (o.kind === "input")
    return ["low", "likely", "high"].every((k) => typeof o[k] === "number") && typeof o.source === "string";
  if (o.kind === "formula") return typeof o.op === "string" && Array.isArray(o.refs);
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/scenarioMap/codec.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/scenarioMap/codec.ts lib/scenarioMap/codec.test.ts
git commit -m "Scenario map: share links and local storage, both failing soft"
```

---

### Task 7: The outline, which is what a phone gets

Build the narrow rendering first. It carries every number, so if the SVG never lands the feature still works.

**Files:**
- Create: `components/scenarioMap/MapOutline.tsx`
- Test: `components/scenarioMap/MapOutline.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/scenarioMap/MapOutline.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapOutline } from "./MapOutline";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { ScenarioMap } from "@/lib/scenarioMap/types";

const map: ScenarioMap = {
  id: "m", name: "m",
  nodes: [
    { id: "a", kind: "input", label: "Recession", low: 0.3, likely: 0.3, high: 0.3, source: "Charlie" },
    { id: "b", kind: "market", label: "No market here", marketId: "gone", side: "yes" },
    { id: "f", kind: "formula", label: "Both", op: "and", refs: ["a", "b"] },
  ],
};

describe("MapOutline", () => {
  it("prints every node label", () => {
    render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    for (const label of ["Recession", "No market here", "Both"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("prints the value of a resolved node", () => {
    render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    expect(screen.getByText("30%")).toBeTruthy();
  });

  it("prints the reason instead of a number when a node is unresolved", () => {
    render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    expect(screen.getByText(/No live market/i)).toBeTruthy();
  });

  it("indents an input under the formula that reads it", () => {
    const { container } = render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    // The outline is rendered roots-last: a formula, then its inputs nested in a ul.
    expect(container.querySelectorAll("ul ul").length).toBeGreaterThan(0);
  });

  it("shows a range only when the node has one", () => {
    const ranged: ScenarioMap = {
      id: "r", name: "r",
      nodes: [{ id: "a", kind: "input", label: "Wide", low: 0.1, likely: 0.5, high: 0.9, source: "x" }],
    };
    render(<MapOutline map={ranged} results={evaluateMap(ranged, [])} />);
    expect(screen.getByText(/to/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/scenarioMap/MapOutline.test.tsx`
Expected: FAIL, cannot resolve `./MapOutline`.

- [ ] **Step 3: Write the implementation**

Create `components/scenarioMap/MapOutline.tsx`:

```tsx
import { pct } from "@/lib/format";
import type { NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";

/**
 * The narrow rendering. Below 640px the picture comes off entirely and the map is
 * an outline: a six-node graph at 375px is neither readable nor tappable, and when
 * a label and a decoration compete for a narrow screen the label is the content.
 * Every number and every source that the SVG shows is here too.
 */
export function MapOutline({ map, results }: { map: ScenarioMap; results: Map<string, NodeResult> }) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const read = new Set<string>();
  for (const n of map.nodes) if (n.kind === "formula") for (const r of n.refs) read.add(r);
  const roots = map.nodes.filter((n) => !read.has(n.id));

  const renderNode = (id: string, seen: Set<string>) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return null;
    const next = new Set(seen).add(id);
    const r = results.get(id);
    const refs = node.kind === "formula" ? node.refs.filter((x) => byId.has(x)) : [];
    return (
      <li key={id} className="mt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 text-[13px] text-[var(--text)]">{node.label}</span>
          {r?.status === "ok" ? (
            <span className="shrink-0 text-right">
              <span className="tabular-nums text-[15px] font-semibold text-accent">{pct(r.p50, 0)}</span>
              {r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005 && (
                <span className="ml-2 tabular-nums text-[11px] text-muted">
                  {pct(r.p10, 0)} to {pct(r.p90, 0)}
                </span>
              )}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-[var(--muted-dim)]">{r?.reason ?? "Unresolved"}</span>
          )}
        </div>
        {node.kind === "input" && node.source && (
          <div className="text-[11px] text-muted">{node.source}</div>
        )}
        {node.kind === "market" && (
          <div className="text-[11px] text-muted">{node.side === "no" ? "NO side" : "YES side"}</div>
        )}
        {refs.length > 0 && (
          <ul className="ml-3 border-l border-white/[0.08] pl-3">
            {refs.map((ref) => renderNode(ref, next))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <ul className="sm:hidden">{roots.map((n) => renderNode(n.id, new Set()))}</ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- components/scenarioMap/MapOutline.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/scenarioMap/MapOutline.tsx components/scenarioMap/MapOutline.test.tsx
git commit -m "Scenario map: the outline a phone gets instead of the picture"
```

---

### Task 8: The SVG picture

**Files:**
- Create: `components/scenarioMap/MapView.tsx`
- Test: `components/scenarioMap/MapView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/scenarioMap/MapView.test.tsx`:

```tsx
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapView } from "./MapView";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { ScenarioMap } from "@/lib/scenarioMap/types";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { Market } from "@/lib/types";

// jsdom has no layout and no ResizeObserver. Give the component a width the way a
// browser would, so the drawing path is the one under test.
beforeAll(() => {
  class RO {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) { this.cb([{ contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

const map: ScenarioMap = {
  id: "m", name: "m",
  nodes: [
    { id: "a", kind: "input", label: "Recession", low: 0.3, likely: 0.3, high: 0.3, source: "Charlie" },
    { id: "b", kind: "market", label: "Fed cuts", marketId: "gone", side: "yes" },
    { id: "f", kind: "formula", label: "Both", op: "and", refs: ["a", "b"] },
  ],
};

describe("MapView", () => {
  it("draws one group per node once a width is known", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(3);
  });

  it("draws one path per edge", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(container.querySelectorAll("[data-edge]")).toHaveLength(2);
  });

  it("labels the svg for a screen reader and does not claim to be an image", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).not.toBe("img");
    expect(svg.getAttribute("aria-label")).toMatch(/map/i);
  });

  it("prints the value on a resolved node and the reason on an unresolved one", () => {
    render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText(/No live market/i)).toBeTruthy();
  });

  it("colours a market node with its own theme colour from the board", () => {
    const board: Market[] = [{
      id: "k1", platform: "Kalshi", title: "Oil", category: "Commodities/Oil", prob: 0.5,
      volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "",
    }];
    const oil: ScenarioMap = {
      id: "o", name: "o",
      nodes: [{ id: "m", kind: "market", label: "Oil", marketId: "k1", side: "yes" }],
    };
    const { container } = render(<MapView map={oil} results={evaluateMap(oil, board)} markets={board} />);
    const rect = container.querySelector("[data-node] rect")!;
    expect(rect.getAttribute("stroke")).toBe(THEME_COLOURS["Commodities/Oil"]);
  });

  it("renders nothing but the measuring container when the width is zero", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} width={0} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/scenarioMap/MapView.test.tsx`
Expected: FAIL, cannot resolve `./MapView`.

- [ ] **Step 3: Write the implementation**

Create `components/scenarioMap/MapView.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { pct } from "@/lib/format";
import { layoutMap, NODE_H, NODE_W } from "@/lib/scenarioMap/layout";
import type { NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { Market } from "@/lib/types";

// Kind, not probability. The blue ramp in lib/format.ts means magnitude, so it
// cannot be reused here: a node's colour has to say what KIND of number it is.
// A market takes its own theme colour from the board, exactly as the board does,
// so one proposition is the same hue wherever it appears on the site.
const INPUT_COLOUR = "#8b93a7";
const FORMULA_COLOUR = "#7cc4ff";
const FALLBACK_MARKET_COLOUR = "#4c9be8";

export function MapView({
  map, results, markets = [], width: fixedWidth,
}: {
  map: ScenarioMap;
  results: Map<string, NodeResult>;
  markets?: Market[];
  width?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    if (fixedWidth != null || !box.current) return;
    const el = box.current;
    const ro = new ResizeObserver((entries) => setMeasured(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidth]);

  const width = fixedWidth ?? measured;
  const layout = width > 0 ? layoutMap(map, width) : null;
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const categoryById = new Map(markets.map((m) => [m.id, m.category]));

  const colourFor = (node: ScenarioMap["nodes"][number]): string => {
    if (node.kind === "input") return INPUT_COLOUR;
    if (node.kind === "formula") return FORMULA_COLOUR;
    return THEME_COLOURS[categoryById.get(node.marketId) ?? ""] ?? FALLBACK_MARKET_COLOUR;
  };

  return (
    <div ref={box} className="hidden w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:block">
      {layout && (
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          // NOT role="img": the nodes are readable content, and role="img" would
          // present the whole panel as one picture and hide them.
          aria-label={`Map of ${map.name}`}
        >
          <g>
            {layout.edges.map((e) => (
              <path
                key={`${e.from}-${e.to}`}
                data-edge
                d={e.path}
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth={1.5}
              />
            ))}
          </g>
          {layout.nodes.map((ln) => {
            const node = byId.get(ln.id)!;
            const r = results.get(ln.id);
            const colour = colourFor(node);
            const ok = r?.status === "ok";
            const hasRange = ok && r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005;
            return (
              <g key={ln.id} data-node transform={`translate(${ln.x - NODE_W / 2}, ${ln.y - NODE_H / 2})`}>
                <rect
                  width={NODE_W} height={NODE_H} rx={10}
                  fill="rgba(255,255,255,0.03)"
                  stroke={ok ? colour : "rgba(255,255,255,0.10)"}
                  strokeWidth={1}
                />
                <text x={10} y={19} fontSize={11.5} fill="var(--text)">
                  {node.label.length > 22 ? `${node.label.slice(0, 21)}\u2026` : node.label}
                </text>
                {ok ? (
                  <>
                    <text x={10} y={40} fontSize={17} fontWeight={600} fill={colour} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pct(r.p50, 0)}
                    </text>
                    {hasRange && (
                      <text x={NODE_W - 10} y={40} textAnchor="end" fontSize={10.5} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {pct(r.p10, 0)} to {pct(r.p90, 0)}
                      </text>
                    )}
                  </>
                ) : (
                  <text x={10} y={39} fontSize={10.5} fill="var(--muted-dim)">
                    {(r?.reason ?? "Unresolved").slice(0, 28)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- components/scenarioMap/MapView.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Confirm the scrollbar is hidden the way the rest of the site does it**

The container className in Step 3 already carries the repo's own pattern, copied from
`components/EventCalendar.tsx:27`:

```
[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
```

Do not add a `.no-scrollbar` utility to `app/globals.css`: there is no such class in this
repo, and a second way of doing one thing is what the next session copies. Verify with
`grep -n "scrollbar" components/scenarioMap/MapView.tsx components/EventCalendar.tsx` that
both carry the same three variants.

A wide map scrolls sideways INSIDE this container, which is allowed. The page itself must
never scroll sideways, which Task 11 Step 6 measures.

- [ ] **Step 6: Run the component tests**

Run: `npm test -- components/scenarioMap/`
Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
git add components/scenarioMap/MapView.tsx components/scenarioMap/MapView.test.tsx
git commit -m "Scenario map: the SVG picture, drawn at container pixel scale"
```

---

### Task 9: The node list and its editors

**Files:**
- Create: `components/scenarioMap/NodeList.tsx`
- Test: `components/scenarioMap/NodeList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/scenarioMap/NodeList.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeList } from "./NodeList";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { ScenarioMap } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";

const market = (id: string, title: string, prob: number): Market => ({
  id, platform: "Kalshi", title, category: "Rates/Fed", prob, volume: 100,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

const map: ScenarioMap = {
  id: "m", name: "m",
  nodes: [
    { id: "i", kind: "input", label: "My read", low: 0.2, likely: 0.3, high: 0.5, source: "Charlie" },
    { id: "k", kind: "market", label: "Fed cuts", marketId: "k1", side: "yes" },
    { id: "f", kind: "formula", label: "Both", op: "and", refs: ["i", "k"] },
  ],
};
const board = [market("k1", "Fed cuts before 2027", 0.8)];
const results = () => evaluateMap(map, board);

describe("NodeList", () => {
  it("renders one row per node with its value", () => {
    render(<NodeList map={map} results={results()} markets={board} onChange={vi.fn()} />);
    expect(screen.getByText("My read")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("names the kind of each node", () => {
    render(<NodeList map={map} results={results()} markets={board} onChange={vi.fn()} />);
    expect(screen.getByText(/Live market/i)).toBeTruthy();
    expect(screen.getByText(/Estimate/i)).toBeTruthy();
    expect(screen.getByText(/Formula/i)).toBeTruthy();
  });

  it("opens an editor when a row is clicked and edits the likely value", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByText("My read"));
    const likely = screen.getByLabelText(/likely/i) as HTMLInputElement;
    fireEvent.change(likely, { target: { value: "40" } });
    expect(onChange).toHaveBeenCalled();
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "i")!;
    expect(edited).toMatchObject({ kind: "input", likely: 0.4 });
  });

  it("flips a market node between the YES and NO side", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByText("Fed cuts"));
    fireEvent.click(screen.getByLabelText(/NO side/i));
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    expect(next.nodes.find((n) => n.id === "k")).toMatchObject({ side: "no" });
  });

  it("removes a node and every ref to it, so no formula is left pointing at nothing", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByText("My read"));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    expect(next.nodes.find((n) => n.id === "i")).toBeUndefined();
    const formula = next.nodes.find((n) => n.id === "f")!;
    expect(formula.kind === "formula" && formula.refs).toEqual(["k"]);
  });

  it("shows the reason on an unresolved row instead of a number", () => {
    const broken: ScenarioMap = {
      id: "b", name: "b",
      nodes: [{ id: "x", kind: "market", label: "Gone", marketId: "nope", side: "yes" }],
    };
    render(<NodeList map={broken} results={evaluateMap(broken, board)} markets={board} onChange={vi.fn()} />);
    expect(screen.getByText(/No live market/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/scenarioMap/NodeList.test.tsx`
Expected: FAIL, cannot resolve `./NodeList`.

- [ ] **Step 3: Write the implementation**

Create `components/scenarioMap/NodeList.tsx`:

```tsx
"use client";
import { useState } from "react";
import { pct } from "@/lib/format";
import type { MapNode, NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";

const FOCUS_RING = "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const FIELD = `w-20 rounded-md border border-white/10 bg-panel/40 px-2 py-1 text-[13px] tabular-nums outline-none ${FOCUS_RING}`;

// What the reader gets from each kind, not how it is stored.
const KIND_LABEL: Record<MapNode["kind"], string> = {
  market: "Live market",
  input: "Estimate",
  formula: "Formula",
};

const OP_LABEL: Record<string, string> = {
  and: "All of them (AND)",
  or: "At least one (OR)",
  not: "The opposite (NOT)",
  mix: "Weighted average",
  depends: "Conditional on another node",
};

export function NodeList({
  map, results, markets, onChange,
}: {
  map: ScenarioMap;
  results: Map<string, NodeResult>;
  markets: Market[];
  onChange: (next: ScenarioMap) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const replace = (id: string, patch: Partial<MapNode>) =>
    onChange({ ...map, nodes: map.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as MapNode) : n)) });

  // Removing a node also removes every ref to it. A formula left pointing at a
  // deleted node would read "Missing input" for ever with nothing to click.
  const remove = (id: string) => {
    setOpenId(null);
    onChange({
      ...map,
      nodes: map.nodes
        .filter((n) => n.id !== id)
        .map((n) => (n.kind === "formula" ? { ...n, refs: n.refs.filter((r) => r !== id) } : n)),
    });
  };

  return (
    <ul className="flex flex-col gap-2">
      {map.nodes.map((node) => {
        const r = results.get(node.id);
        const open = openId === node.id;
        return (
          <li key={node.id} className="rounded-xl border border-white/[0.06] bg-panel/40">
            <button
              onClick={() => setOpenId(open ? null : node.id)}
              aria-expanded={open}
              className={`flex w-full items-baseline gap-3 px-4 py-3 text-left ${FOCUS_RING}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[var(--text)]">{node.label}</span>
                <span className="text-[11px] text-muted">
                  {KIND_LABEL[node.kind]}
                  {node.kind === "input" && node.source ? ` \u00b7 ${node.source}` : ""}
                  {node.kind === "market" ? ` \u00b7 ${node.side === "no" ? "NO" : "YES"} side` : ""}
                  {node.kind === "formula" ? ` \u00b7 ${OP_LABEL[node.op] ?? node.op}` : ""}
                </span>
              </span>
              {r?.status === "ok" ? (
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums text-[17px] font-semibold text-accent">{pct(r.p50, 0)}</span>
                  {r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005 && (
                    <span className="block tabular-nums text-[11px] text-muted">
                      {pct(r.p10, 0)} to {pct(r.p90, 0)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-[var(--muted-dim)]">{r?.reason ?? "Unresolved"}</span>
              )}
            </button>

            {open && (
              <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-3">
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  Label
                  <input
                    value={node.label}
                    onChange={(e) => replace(node.id, { label: e.target.value })}
                    className={`flex-1 rounded-md border border-white/10 bg-panel/40 px-2 py-1 text-[13px] text-[var(--text)] outline-none ${FOCUS_RING}`}
                  />
                </label>

                {node.kind === "input" && (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      {(["low", "likely", "high"] as const).map((k) => (
                        <label key={k} className="flex items-center gap-2 text-[12px] capitalize text-muted">
                          {k}
                          <input
                            aria-label={k}
                            type="number" min={0} max={100} step={1}
                            value={Math.round(node[k] * 100)}
                            onChange={(e) => replace(node.id, { [k]: Number(e.target.value) / 100 } as Partial<MapNode>)}
                            className={FIELD}
                          />
                          <span className="text-muted">%</span>
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-[12px] text-muted">
                      Source
                      <input
                        value={node.source}
                        placeholder="Where this number came from"
                        onChange={(e) => replace(node.id, { source: e.target.value } as Partial<MapNode>)}
                        className={`flex-1 rounded-md border border-white/10 bg-panel/40 px-2 py-1 text-[13px] text-[var(--text)] outline-none ${FOCUS_RING}`}
                      />
                    </label>
                  </>
                )}

                {node.kind === "market" && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-4">
                      {(["yes", "no"] as const).map((side) => (
                        <label key={side} className="flex items-center gap-2 text-[12px] text-muted">
                          <input
                            type="radio"
                            aria-label={`${side.toUpperCase()} side`}
                            checked={node.side === side}
                            onChange={() => replace(node.id, { side } as Partial<MapNode>)}
                            className="accent-[var(--accent)]"
                          />
                          {side.toUpperCase()} side
                        </label>
                      ))}
                    </div>
                    <div className="text-[11px] text-muted">
                      {markets.find((m) => m.id === node.marketId)?.title ?? "Not on the board today"}
                    </div>
                  </div>
                )}

                {node.kind === "formula" && (
                  <div className="text-[12px] text-muted">
                    Reads:{" "}
                    {node.refs
                      .map((id) => map.nodes.find((n) => n.id === id)?.label ?? "missing")
                      .join(node.op === "depends" ? " | " : ", ")}
                    {node.op === "depends" && (
                      <span className="ml-1 text-[var(--muted-dim)]">(condition | if yes | if no)</span>
                    )}
                  </div>
                )}

                <div>
                  <button
                    onClick={() => remove(node.id)}
                    className={`rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- components/scenarioMap/NodeList.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add components/scenarioMap/NodeList.tsx components/scenarioMap/NodeList.test.tsx
git commit -m "Scenario map: node rows and their inline editors"
```

---

### Task 10: The container, and wiring the page

**Files:**
- Create: `components/scenarioMap/ScenarioMap.tsx`
- Test: `components/scenarioMap/ScenarioMap.test.tsx`
- Modify: `app/scenario/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/scenarioMap/ScenarioMap.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioMap } from "./ScenarioMap";
import { encodeMap, loadSaved, STORAGE_KEY } from "@/lib/scenarioMap/codec";
import type { ScenarioMap as MapType } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";

beforeAll(() => {
  class RO {
    constructor(private cb: ResizeObserverCallback) {}
    observe() { this.cb([{ contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {} disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

const mk = (id: string, title: string, category: Market["category"], prob: number): Market => ({
  id, platform: "Kalshi", title, category, prob, volume: 1000,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

const board: Market[] = [
  mk("rec", "Will the US enter a recession in 2026?", "Growth/Recession", 0.3),
  mk("cut", "Fed cut rates before 2027", "Rates/Fed", 0.8),
];

describe("ScenarioMap", () => {
  beforeEach(() => { window.localStorage.clear(); window.location.hash = ""; });

  it("opens on a real map with live numbers, not an empty canvas", () => {
    render(<ScenarioMap markets={board} />);
    // getByDisplayValue, not getByText: the name is an input. And getAllByText for
    // the figure, because jsdom applies no CSS, so MapView and MapOutline BOTH
    // render and every number appears more than once.
    expect(screen.getByDisplayValue("Recession in 2026")).toBeTruthy();
    expect(screen.getAllByText("24%").length).toBeGreaterThan(0); // 0.3 * 0.8
  });

  it("does not write the default to the URL", () => {
    render(<ScenarioMap markets={board} />);
    expect(window.location.hash).toBe("");
  });

  it("switches map when another chip is pressed", () => {
    render(<ScenarioMap markets={board} />);
    // An exact-string role name matches the CHIP only: the node row's accessible
    // name is the whole row, label plus kind plus figure.
    fireEvent.click(screen.getByRole("button", { name: "Soft landing" }));
    expect(screen.getAllByText("56%").length).toBeGreaterThan(0); // 0.7 * 0.8
  });

  it("loads a map from the URL hash as an unsaved copy", () => {
    const shared: MapType = {
      id: "shared", name: "From a link",
      nodes: [{ id: "a", kind: "input", label: "A", low: 0.4, likely: 0.4, high: 0.4, source: "x" }],
    };
    window.location.hash = `#m=${encodeMap(shared)}`;
    render(<ScenarioMap markets={board} />);
    expect(screen.getByDisplayValue("From a link")).toBeTruthy();
    expect(loadSaved()).toEqual([]); // opening a link stores nothing
  });

  it("ignores a malformed hash and still renders the default", () => {
    window.location.hash = "#m=rubbish";
    render(<ScenarioMap markets={board} />);
    expect(screen.getByDisplayValue("Recession in 2026")).toBeTruthy();
  });

  it("saves an edited map under its own id, leaving the built-in alone", () => {
    render(<ScenarioMap markets={board} />);
    fireEvent.click(screen.getByRole("button", { name: /add estimate/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const saved = loadSaved();
    expect(saved).toHaveLength(1);
    expect(saved[0].builtIn).toBeUndefined();
    expect(saved[0].id).not.toBe("recession");
  });

  it("renders when localStorage throws", () => {
    // spyOn the prototype: assigning over window.localStorage.getItem is not
    // reliably permitted in jsdom, and a test that cannot arm itself proves nothing.
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => render(<ScenarioMap markets={board} />)).not.toThrow();
    spy.mockRestore();
  });

  it("starts a new map with one estimate node rather than a blank canvas", () => {
    render(<ScenarioMap markets={board} />);
    fireEvent.click(screen.getByRole("button", { name: /^new map$/i }));
    expect(screen.getByDisplayValue("Untitled map")).toBeTruthy();
    // getAllByText: "Add estimate" is on the page too.
    expect(screen.getAllByText(/Estimate/i).length).toBeGreaterThan(0);
  });

  it("keeps the storage key stable", () => {
    expect(STORAGE_KEY).toBe("crowdwise.scenarioMaps.v1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/scenarioMap/ScenarioMap.test.tsx`
Expected: FAIL, cannot resolve `./ScenarioMap`.

- [ ] **Step 3: Write the implementation**

Create `components/scenarioMap/ScenarioMap.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { builtInMaps } from "@/lib/scenarioMap/builtins";
import { decodeMap, deleteMap, encodeMap, loadSaved, saveMap } from "@/lib/scenarioMap/codec";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { MapNode, ScenarioMap as MapType } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";
import { MapOutline } from "./MapOutline";
import { MapView } from "./MapView";
import { NodeList } from "./NodeList";

const FOCUS_RING = "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const newId = () => `n${Math.random().toString(36).slice(2, 9)}`;

export function ScenarioMap({ markets }: { markets: Market[] }) {
  const builtIns = useMemo(() => builtInMaps(markets), [markets]);
  const [saved, setSaved] = useState<MapType[]>([]);
  const [current, setCurrent] = useState<MapType>(builtIns[0]);
  const [dirty, setDirty] = useState(false);
  const [shared, setShared] = useState(false);

  // Storage and the hash are read AFTER mount, never during render: the server
  // has neither, and reading them in render would make the two disagree.
  useEffect(() => {
    setSaved(loadSaved());
    const hash = window.location.hash.match(/(?:^|#|&)m=([^&]+)/);
    const fromLink = hash ? decodeMap(hash[1]) : null;
    if (fromLink) { setCurrent(fromLink); setShared(true); }
  }, []);

  // The built-ins are rebuilt whenever the board moves, so an untouched built-in
  // has to follow it. An edited map is the reader's and is left alone.
  useEffect(() => {
    if (dirty || shared) return;
    const fresh = builtIns.find((m) => m.id === current.id);
    if (fresh) setCurrent(fresh);
  }, [builtIns, current.id, dirty, shared]);

  const results = useMemo(() => evaluateMap(current, markets), [current, markets]);

  const edit = (next: MapType) => { setCurrent(next); setDirty(true); };

  const pick = (map: MapType) => { setCurrent(map); setDirty(false); setShared(false); };

  const addNode = (node: MapNode) => edit({ ...current, nodes: [...current.nodes, node] });

  const onSave = () => {
    // A built-in is never overwritten: saving an edited one forks it.
    const target: MapType =
      current.builtIn || shared
        ? { ...current, id: `own-${newId()}`, name: `${current.name} (mine)`, builtIn: undefined }
        : current;
    saveMap(target);
    setSaved(loadSaved());
    setCurrent(target);
    setDirty(false);
    setShared(false);
  };

  const onShare = () => {
    const hash = `#m=${encodeMap(current)}`;
    window.history.replaceState(null, "", hash);
    navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}${hash}`).catch(() => {});
  };

  const onNew = () =>
    pick({
      id: `own-${newId()}`,
      name: "Untitled map",
      // Never an empty canvas: one node to edit beats a blank screen.
      nodes: [{ id: newId(), kind: "input", label: "My estimate", low: 0.2, likely: 0.35, high: 0.5, source: "" }],
    });

  const chips = [...builtIns, ...saved];

  return (
    <div>
      <h1 className="mb-4 text-[28px] font-semibold tracking-[-0.02em]">Scenario Map</h1>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {chips.map((m) => (
          <button
            key={m.id}
            onClick={() => pick(m)}
            className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${FOCUS_RING} ${
              m.id === current.id
                ? "border-accent bg-accent/[0.12] text-[var(--text)]"
                : "border-white/10 text-muted hover:border-white/25 hover:text-[var(--text)]"
            }`}
          >
            {m.name}
          </button>
        ))}
        <button onClick={onNew} className={`rounded-full border border-dashed border-white/20 px-3 py-1 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}>
          New map
        </button>
      </div>

      {/* The map's own name, and the only way to rename one. */}
      <input
        aria-label="Map name"
        value={current.name}
        onChange={(e) => edit({ ...current, name: e.target.value })}
        className={`mb-3 w-full max-w-sm rounded-lg border border-white/10 bg-panel/40 px-3 py-1.5 text-[15px] font-medium text-[var(--text)] outline-none ${FOCUS_RING}`}
      />

      <div className="mb-6 rounded-2xl border border-white/[0.06] bg-panel/40 p-4">
        <MapView map={current} results={results} markets={markets} />
        <MapOutline map={current} results={results} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => addNode({ id: newId(), kind: "input", label: "New estimate", low: 0.2, likely: 0.35, high: 0.5, source: "" })}
          className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
        >
          Add estimate
        </button>
        <button
          onClick={() => {
            const top = markets.find((m) => m.prob != null);
            addNode({ id: newId(), kind: "market", label: top?.title.slice(0, 40) ?? "Pick a market", marketId: top?.id ?? "", side: "yes" });
          }}
          className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
        >
          Add market
        </button>
        <button
          onClick={() =>
            addNode({ id: newId(), kind: "formula", label: "All of them", op: "and", refs: current.nodes.slice(0, 2).map((n) => n.id) })
          }
          className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
        >
          Add formula
        </button>
        <span className="ml-auto flex gap-2">
          <button onClick={onShare} className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}>
            Share
          </button>
          <button onClick={onSave} className={`rounded-lg border border-accent bg-accent/[0.12] px-3 py-1.5 text-[12px] text-[var(--text)] ${FOCUS_RING}`}>
            Save
          </button>
          {!current.builtIn && saved.some((m) => m.id === current.id) && (
            <button
              onClick={() => { deleteMap(current.id); setSaved(loadSaved()); pick(builtIns[0]); }}
              className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
            >
              Delete
            </button>
          )}
        </span>
      </div>

      <NodeList map={current} results={results} markets={markets} onChange={edit} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- components/scenarioMap/ScenarioMap.test.tsx`
Expected: PASS, 9 tests. If the "opens on a real map" test fails on the figure, print `evaluateMap` output for the default map and check the fixture titles still satisfy the predicates in `lib/thesis.ts`.

- [ ] **Step 5: Wire the page**

Replace the whole of `app/scenario/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { ScenarioMap } from "@/components/scenarioMap/ScenarioMap";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = {
  title: "Scenario Map · Crowdwise",
  // The page carries no standfirst: this sentence exists for a share card, where
  // a reader arriving cold needs it, and nobody on the page has to read it.
  description:
    "Build a macro view as a map: live market prices, your own estimates, and the formulas that combine them.",
  alternates: { canonical: "/scenario" },
};

export default async function ScenarioPage() {
  const markets = await fetchTopMarkets();
  return <ScenarioMap markets={markets} />;
}
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS everywhere except `components/ScenarioBuilder.test.tsx`, which still tests the component being replaced. Leave it failing; Task 11 removes it.

- [ ] **Step 7: Commit**

```bash
git add components/scenarioMap/ScenarioMap.tsx components/scenarioMap/ScenarioMap.test.tsx app/scenario/page.tsx
git commit -m "Scenario map: the page, opening on a live built-in map"
```

---

### Task 11: Remove what it replaces, and check the route table

**Files:**
- Delete: `components/ScenarioBuilder.tsx`, `components/ScenarioBuilder.test.tsx`, `components/ThesisBaskets.tsx`
- Modify: `docs/TODO.md`
- Check only, expected unchanged: `components/Nav.tsx`

- [ ] **Step 1: Confirm nothing else imports the three files**

Run: `grep -rn "ScenarioBuilder\|ThesisBaskets" --include=*.tsx --include=*.ts app components lib`
Expected: only the three files themselves. If anything else appears, stop and fix that importer first.

`lib/thesis.ts` and `lib/scenario.ts` must NOT be deleted: `builtins.ts` reads `THESES` and `resolveThesis`, and `lib/thesis.ts` imports `jointYes`.

- [ ] **Step 2: Delete them**

```bash
git rm components/ScenarioBuilder.tsx components/ScenarioBuilder.test.tsx components/ThesisBaskets.tsx
```

- [ ] **Step 3: Leave the nav alone, and check why**

`components/Nav.tsx` already reads `{ href: "/map", label: "Map" }` on line 6 and
`{ href: "/scenario", label: "Scenario" }` on line 7. Do NOT rename the scenario tab to
"Map": `/map` is the Market Map treemap and two tabs reading Map would send a reader to
the wrong page. "Scenario" stays.

Check the one thing that did change: the new h1 is "Scenario Map" and `/map`'s h1 is
"Market Map" (`components/MarketMapView.tsx:58` and `:66`). Two headings ending in the
same word are acceptable because the first word separates them, but read both in the same
viewport before accepting it, and say so rather than assuming. If they read as one page
split in two, the fix is a new name for the new page, not a new nav label.

Make no edit in this step unless that check fails.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, no failures.

- [ ] **Step 5: Check the route table, which is the rule this page can break**

Run: `npm run build`
Expected: the route table prints `/scenario` as `○` (Static). If it prints `ƒ`, a `cache: "no-store"` fetch has reached the render path and the whole page has silently left static generation. The build output names the offending URL. Do not proceed until it is `○`.

- [ ] **Step 6: Look at the page at three widths**

Run: `npm run dev`, then open `http://localhost:3000/scenario` and check, in this order:

1. **1280px.** The picture draws, arrows run left to right, no node overlaps another, no horizontal scrollbar is visible.
2. **640px.** Still the picture. This is the boundary, so confirm which rendering you are getting rather than assuming.
3. **375px.** The picture is gone and the outline is there, the page does not scroll sideways, and every number in the outline matches the one the picture showed at 1280.

Measure the third rather than eyeballing it: in the browser console, `document.documentElement.scrollWidth > document.documentElement.clientWidth` must be `false`. A screenshot is taken at the viewport width and is the one check that can never show sideways overflow.

- [ ] **Step 7: Update the TODO**

In `docs/TODO.md`, find the line reading:

```
- Dormant Metaculus integration (`lib/metaculus.ts`) - BLOCKED, revisit only if access opens.
```

and add directly beneath it:

```
- Scenario Map shipped 23/09/2026, replacing the flat picker and the thesis-basket cards.
  The four theses are now the built-in maps (`lib/scenarioMap/builtins.ts`) and resolve
  through `lib/thesis.ts`'s predicates, so no market id is written down. If the Metaculus
  token ever lands, a forecast node is a fourth node kind and nothing else changes.
  Spec: `docs/superpowers/specs/2026-09-23-scenario-map-design.md`.
```

- [ ] **Step 8: Commit and push**

```bash
git add -u
git add docs/TODO.md
git status -s
git commit -m "Scenario map replaces the flat picker and the thesis cards"
git push origin master
git status -sb
```

`git status -sb` must print `## master...origin/master` with no `[ahead]`. A heredoc or a failed push can leave the commit local while the shell still reports success, so read the status rather than the echo.

---

## Verification checklist

Run these after Task 11, before calling the feature done.

- [ ] `npm test` passes with no skipped files.
- [ ] `npm run lint` is clean.
- [ ] `npm run build` prints `/scenario` as `○`.
- [ ] `/scenario` at 375px has no horizontal overflow, measured in the console.
- [ ] A share link opened in a fresh browser profile renders the shared map and writes nothing to storage.
- [ ] A built-in map edited and saved leaves the built-in chip unchanged.
- [ ] `grep -rn $'\u2014' components/scenarioMap lib/scenarioMap docs/superpowers/specs/2026-09-23-scenario-map-design.md docs/superpowers/plans/2026-09-23-scenario-map.md` returns nothing. The em dashes already in `lib/format.ts` are null glyphs in numeric output and stay.
