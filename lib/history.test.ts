import { describe, it, expect } from "vitest";
import { computeMoves, historyMove, topMovers, themeConviction, marketProbSeries } from "./history";

describe("computeMoves", () => {
  it("delta vs latest snapshot; omits ids not in snapshot", () => {
    const history = [{ ts: "t0", probs: { a: 0.40, b: 0.50 } }];
    const records = [{ id: "a", prob: 0.55 }, { id: "b", prob: 0.50 }, { id: "c", prob: 0.10 }] as any;
    const moves = computeMoves(records, history);
    expect(moves.a).toBeCloseTo(0.15);
    expect(moves.b).toBeCloseTo(0.0);
    expect("c" in moves).toBe(false);
  });
  it("no history -> empty", () => expect(computeMoves([{ id: "a", prob: 0.5 }] as any, [])).toEqual({}));
});

describe("historyMove", () => {
  it("net move last - first", () =>
    expect(historyMove([["2026-06-01", 0.40], ["2026-06-02", 0.55], ["2026-06-03", 0.50]])).toBeCloseTo(0.10));
  it("negative move", () => expect(historyMove([["a", 0.6], ["b", 0.45]])).toBeCloseTo(-0.15));
  it("null when too few points", () => {
    expect(historyMove([["a", 0.5]])).toBeNull();
    expect(historyMove([])).toBeNull();
  });
});

const rec = (id: string, cat: string, prob: number | null, vol: number) =>
  ({ id, category: cat, prob, volume: vol, title: `market ${id}`, platform: "Kalshi" }) as any;

describe("topMovers", () => {
  it("sorts by absolute move and limits", () => {
    const recs = [rec("a", "Inflation", 0.5, 10), rec("b", "Rates/Fed", 0.5, 10), rec("c", "Geopolitics", 0.5, 10)];
    const out = topMovers(recs, { a: 0.02, b: -0.20, c: 0.05 }, 2);
    expect(out.map((r) => r.id)).toEqual(["b", "c"]);
    expect(out[0].move).toBe(-0.20);
  });
  it("skips records without a move", () =>
    expect(topMovers([rec("a", "Inflation", 0.5, 10), rec("b", "Rates/Fed", 0.5, 10)], { a: 0.1}, 10).map((r) => r.id)).toEqual(["a"]));
});

describe("themeConviction", () => {
  it("volume-weights the average", () => {
    const out = themeConviction([rec("a", "Inflation", 0.20, 1), rec("b", "Inflation", 0.80, 9)]);
    const infl = out.find((r) => r.category === "Inflation")!;
    expect(infl.weightedProb).toBeCloseTo(0.74);
    expect(infl.count).toBe(2);
  });
  it("zero volume -> simple mean", () => {
    const out = themeConviction([rec("a", "Rates/Fed", 0.40, 0), rec("b", "Rates/Fed", 0.60, 0)]);
    expect(out.find((r) => r.category === "Rates/Fed")!.weightedProb).toBeCloseTo(0.50);
  });
  it("category order, skips empty, ignores null prob", () => {
    const out = themeConviction([rec("a", "Geopolitics", 0.5, 1), rec("b", "Inflation", 0.5, 1), rec("c", "Inflation", null, 5)]);
    expect(out.map((r) => r.category)).toEqual(["Inflation", "Geopolitics"]);
    expect(out[0].count).toBe(1);
  });
});

describe("marketProbSeries", () => {
  it("builds per-id oldest-first with gaps", () => {
    const hist = [{ ts: "2026-06-01", probs: { a: 0.5, b: 0.3 } }, { ts: "2026-06-02", probs: { a: 0.6 } }];
    const out = marketProbSeries(hist);
    expect(out.a).toEqual([["2026-06-01", 0.5], ["2026-06-02", 0.6]]);
    expect(out.b).toEqual([["2026-06-01", 0.3]]);
  });
  it("filters to requested ids", () =>
    expect(Object.keys(marketProbSeries([{ ts: "d", probs: { a: 0.5, b: 0.3 } }], ["a"]))).toEqual(["a"]));
  it("empty history -> empty", () => expect(marketProbSeries([])).toEqual({}));
});
