import { describe, it, expect } from "vitest";
import { resolveNodes, evaluateMap } from "./engine";
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

  it("gives the reason 'depends on an unresolved input' (not 'circular') to a node " +
    "that shares a convergence point with an already-explored cycle - a known limitation " +
    "of the single-pass DFS, pinned here so it stays a deliberate, visible choice", () => {
    // X refs Y and Z; Y refs W; Z refs W; W refs X. All four are structurally on
    // a cycle. The DFS explores X -> Y -> W first, finds the X/Y/W back edge and
    // marks W done (state 2) before it ever walks the X -> Z -> W branch, so no
    // back edge is recorded for Z. Z is still correctly unresolved (W is), the
    // cascade is sound, only the stated reason is less precise than it could be.
    const r = resolveNodes(
      map(
        { id: "x", kind: "formula", label: "X", op: "and", refs: ["y", "z"] },
        { id: "y", kind: "formula", label: "Y", op: "not", refs: ["w"] },
        { id: "z", kind: "formula", label: "Z", op: "not", refs: ["w"] },
        { id: "w", kind: "formula", label: "W", op: "not", refs: ["x"] },
      ),
      [],
    );
    expect(r.get("x")!.reason).toMatch(/circular/i);
    expect(r.get("y")!.reason).toMatch(/circular/i);
    expect(r.get("w")!.reason).toMatch(/circular/i);
    expect(r.get("z")!.status).toBe("unresolved");
    expect(r.get("z")!.reason).toMatch(/unresolved input/i);
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

  it("an unrecognised op is reported as unknown, not thrown", () => {
    // The plan formula-op string reaches this switch straight from a share
    // link (see codec.ts): a genuinely new/misspelled op must resolve to the
    // ordinary "unknown operator" reason, same as any other malformed node.
    const r = resolveNodes(
      map({ id: "f", kind: "formula", label: "F", op: "xor", refs: [] } as unknown as ScenarioMap["nodes"][number]),
      [],
    );
    expect(r.get("f")!.status).toBe("unresolved");
    expect(r.get("f")!.reason).toMatch(/unknown operator xor/i);
  });

  it.each(["hasOwnProperty", "valueOf", "toString", "constructor"])(
    "an op naming an inherited Object.prototype member ('%s') does not throw and is reported as unknown, " +
      "not invoked as a function",
    (op) => {
      // A crafted share link can put any string in `op`. REF_RULES used to be a
      // plain object literal, so `REF_RULES[op]` for one of these names resolved
      // to a real inherited method and got called with (refs, weights) as its
      // arguments: hasOwnProperty/valueOf threw (crashing the whole page's
      // render, not just this node), toString silently returned "[object
      // Undefined]", and constructor returned the Array constructor invoked as
      // a function, i.e. an array, into a field the type system says is a
      // string. All four must instead behave exactly like any other unknown
      // operator name.
      const f = { id: "f", kind: "formula", label: "F", op, refs: [] } as unknown as ScenarioMap["nodes"][number];
      let r: ReturnType<typeof resolveNodes> | undefined;
      expect(() => { r = resolveNodes(map(f), []); }).not.toThrow();
      const res = r!.get("f")!;
      expect(res.status).toBe("unresolved");
      expect(typeof res.reason).toBe("string");
      expect(Array.isArray(res.reason)).toBe(false);
      expect(res.reason).toMatch(/unknown operator/i);
    },
  );

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

  it("DEPENDS collapses exactly to the 'if yes' branch when cond is 1", () => {
    // Boundary check so a swap of refs[1]/refs[2] cannot hide inside a value
    // that still looks plausible at cond = 0.25. yes and no are set far apart
    // so a swap is unmissable.
    const r = evaluateMap(
      map(point("cond", 1), point("yes", 0.9), point("no", 0.1),
        { id: "f", kind: "formula", label: "F", op: "depends", refs: ["cond", "yes", "no"] }),
      [],
    );
    expect(r.get("f")!.p50).toBeCloseTo(0.9, 6);
  });

  it("DEPENDS collapses exactly to the 'if no' branch when cond is 0", () => {
    const r = evaluateMap(
      map(point("cond", 0), point("yes", 0.9), point("no", 0.1),
        { id: "f", kind: "formula", label: "F", op: "depends", refs: ["cond", "yes", "no"] }),
      [],
    );
    expect(r.get("f")!.p50).toBeCloseTo(0.1, 6);
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

  it("marks a market with a non-finite price unresolved instead of a confident figure", () => {
    // A NaN price used to slip past the `!= null` checks and come out the other
    // end as a tight, confident 0% (clamp01 silently turns NaN into 0). It must
    // instead name its own reason and print no figures at all, same as any
    // other broken node.
    const bad = [{
      id: "k1", platform: "Kalshi" as const, title: "x", category: "Rates/Fed" as const,
      prob: Number.NaN, volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "",
    }];
    const r = evaluateMap(
      map({ id: "m", kind: "market", label: "M", marketId: "k1", side: "yes" }),
      bad,
    );
    const v = r.get("m")!;
    expect(v.status).toBe("unresolved");
    expect(v.reason).toMatch(/not a usable number/i);
    expect(v.p50).toBeNull();
    expect(v.p10).toBeNull();
    expect(v.p90).toBeNull();
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

  it("a mix node with an infinite weight is unresolved with null figures, not a confident 0", () => {
    const r = evaluateMap(
      map(point("a", 0.5), point("b", 0.5),
        { id: "f", kind: "formula", label: "F", op: "mix", refs: ["a", "b"], weights: [Infinity, 1] }),
      [],
    );
    const v = r.get("f")!;
    expect(v.status).toBe("unresolved");
    expect(v.reason).toBeTruthy();
    expect(v.p50).toBeNull();
    expect(v.p10).toBeNull();
    expect(v.p90).toBeNull();
  });

  it("a mix node with a NaN weight is unresolved with null figures", () => {
    const r = evaluateMap(
      map(point("a", 0.5), point("b", 0.5),
        { id: "f", kind: "formula", label: "F", op: "mix", refs: ["a", "b"], weights: [Number.NaN, 1] }),
      [],
    );
    const v = r.get("f")!;
    expect(v.status).toBe("unresolved");
    expect(v.reason).toBeTruthy();
    expect(v.p50).toBeNull();
  });

  it("a mix node with two finite weights whose SUM overflows is unresolved, not just per-weight checked", () => {
    // Neither weight alone is non-finite; only their sum is. A fix that only
    // validates individual weights does not catch this one.
    const r = evaluateMap(
      map(point("a", 0.5), point("b", 0.5),
        { id: "f", kind: "formula", label: "F", op: "mix", refs: ["a", "b"], weights: [1e308, 1e308] }),
      [],
    );
    const v = r.get("f")!;
    expect(v.status).toBe("unresolved");
    expect(v.reason).toBeTruthy();
    expect(v.p50).toBeNull();
  });

  it("a sibling of a poisoned node still reports its own figures", () => {
    // One broken mix node (sum overflow) and one healthy node that does not
    // read it. The healthy node must still carry a real number.
    const r = evaluateMap(
      map(
        point("a", 0.5), point("b", 0.5),
        { id: "broken", kind: "formula", label: "Broken", op: "mix", refs: ["a", "b"], weights: [1e308, 1e308] },
        point("c", 0.3),
      ),
      [],
    );
    const healthy = r.get("c")!;
    expect(healthy.status).toBe("ok");
    expect(healthy.p50).toBeCloseTo(0.3, 6);
  });

  it("a node downstream of a poisoned node is also unresolved, not a confident figure", () => {
    const r = evaluateMap(
      map(
        point("a", 0.5), point("b", 0.5),
        { id: "broken", kind: "formula", label: "Broken", op: "mix", refs: ["a", "b"], weights: [1e308, 1e308] },
        { id: "downstream", kind: "formula", label: "D", op: "not", refs: ["broken"] },
      ),
      [],
    );
    const d = r.get("downstream")!;
    expect(d.status).toBe("unresolved");
    expect(d.reason).toBeTruthy();
    expect(d.p50).toBeNull();
  });
});
