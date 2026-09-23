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
