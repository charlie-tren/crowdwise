import { describe, it, expect } from "vitest";
import { computeTopMovers } from "./movers";
import type { Market, HistoryPoint } from "./types";

const m = (id: string, vol: number, plat: "Kalshi" | "Polymarket" = "Kalshi", series = "KX"): Market => ({
  id, platform: plat, title: `t-${id}`, category: "Rates/Fed", prob: 0.5, volume: vol,
  endDate: "2026-12-31", status: "active", series, event: "",
});

const pts = (first: number, last: number): HistoryPoint[] => [["2026-06-01", first], ["2026-06-08", last]];

describe("computeTopMovers", () => {
  it("ranks by absolute move, caps topN, skips tiny moves", async () => {
    const markets = [m("a", 100), m("b", 90), m("c", 80), m("d", 70)];
    const hist: Record<string, HistoryPoint[]> = {
      a: pts(0.5, 0.55),   // +0.05
      b: pts(0.5, 0.20),   // -0.30 (biggest)
      c: pts(0.5, 0.5005), // +0.0005 -> below minMove, dropped
      d: pts(0.5, 0.60),   // +0.10
    };
    const out = await computeTopMovers(markets, async (_s, id) => hist[id] ?? [], { topN: 2 });
    // fetchHistory receives the market id (e.g. "b"), not the title
    expect(out.map((x) => x.id)).toEqual(["b", "d"]); // |0.30| > |0.10|
    expect(out[0].move).toBeCloseTo(-0.30);
  });

  it("only considers Kalshi markets with a series", async () => {
    const markets = [m("k", 100), m("p", 999, "Polymarket", ""), m("noseries", 500, "Kalshi", "")];
    const seen: string[] = [];
    await computeTopMovers(markets, async (_s, id) => { seen.push(id); return pts(0.4, 0.6); });
    expect(seen).toEqual(["k"]); // only the Kalshi-with-series market was fetched
  });

  it("a failing fetch is skipped, not fatal", async () => {
    const markets = [m("ok", 100), m("bad", 90)];
    const out = await computeTopMovers(markets, async (_s, id) => {
      if (id === "bad") throw new Error("boom");
      return pts(0.3, 0.5);
    });
    expect(out.map((x) => x.id)).toEqual(["ok"]);
  });
});
