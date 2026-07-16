import { describe, it, expect, afterEach } from "vitest";
import {
  fetchKalshiMarkets, fetchPolymarketMarkets, fetchKalshiMarketHistory, setHttpGetJson, resetHttpGetJson,
} from "./sources";

afterEach(() => resetHttpGetJson());

describe("fetchKalshiMarkets (mocked seam)", () => {
  it("iterates series and tags theme", async () => {
    setHttpGetJson(async (_url, params) => {
      const s = params!.series_ticker as string;
      return { markets: [{ ticker: `${s}-A`, title: "x", last_price_dollars: "0.5", volume_fp: "10", status: "active" }] };
    });
    const out = await fetchKalshiMarkets({ KXFED: "Rates/Fed", KXCPIYOY: "Inflation" });
    expect(out.length).toBe(2);
    const cats = Object.fromEntries(out.map((r) => [r.id, r.category]));
    expect(cats["KXFED-A"]).toBe("Rates/Fed");
    expect(cats["KXCPIYOY-A"]).toBe("Inflation");
  });

  it("one failing series is not fatal", async () => {
    setHttpGetJson(async (_url, params) => {
      if (params!.series_ticker === "BOOM") throw new Error("boom");
      return { markets: [{ ticker: "KXFED-A", last_price_dollars: "0.5", volume_fp: "10", status: "active" }] };
    });
    const out = await fetchKalshiMarkets({ BOOM: "Rates/Fed", KXFED: "Rates/Fed" });
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("KXFED-A");
  });

  it("empty response", async () => {
    setHttpGetJson(async () => ({ markets: [] }));
    expect(await fetchKalshiMarkets({ KXFED: "Rates/Fed" })).toEqual([]);
  });
});

describe("fetchPolymarketMarkets (mocked seam)", () => {
  it("bare list response", async () => {
    setHttpGetJson(async () => [
      { conditionId: "0x1", question: "US recession in 2026?", outcomePrices: '["0.3","0.7"]', volumeNum: 100, active: true },
      { conditionId: "0x2", question: "Lakers win tonight?", outcomePrices: '["0.5","0.5"]', volumeNum: 200, active: true },
    ]);
    const out = await fetchPolymarketMarkets();
    expect(out.length).toBe(2);
    expect(out[0].category).toBe("Growth/Recession");
    expect(out[1].category).toBe("Other");
  });

  it("wrapped data response", async () => {
    setHttpGetJson(async () => ({ data: [{ conditionId: "0x9", question: "CPI above 3%?", outcomePrices: '["0.4","0.6"]', active: true }] }));
    const out = await fetchPolymarketMarkets();
    expect(out.length).toBe(1);
    expect(out[0].category).toBe("Inflation");
  });
});

describe("fetchKalshiMarketHistory (mocked seam)", () => {
  const candles = () => ({ candlesticks: [
    { end_period_ts: 1735689600, price: { close_dollars: "0.40" } },
    { end_period_ts: 1735776000, price: { close_dollars: "0.55" } },
  ]});
  it("parses candles to iso/prob pairs oldest-first", async () => {
    setHttpGetJson(async () => candles());
    const out = await fetchKalshiMarketHistory("KXFED", "KXFED-X", { days: 30, nowTs: 1735800000 });
    expect(out.length).toBe(2);
    expect(out[0][1]).toBeCloseTo(0.40);
    expect(out[1][1]).toBeCloseTo(0.55);
    expect(out[0][0] < out[1][0]).toBe(true);
  });
  it("falls back to bid/ask midpoint", async () => {
    setHttpGetJson(async () => ({ candlesticks: [
      { end_period_ts: 1735689600, price: { close_dollars: "0.0000" }, yes_bid: { close_dollars: "0.30" }, yes_ask: { close_dollars: "0.50" } },
    ]}));
    const out = await fetchKalshiMarketHistory("KXFED", "KXFED-X", { nowTs: 1735800000 });
    expect(out[0][1]).toBeCloseTo(0.40);
  });
  it("empty on missing tickers", async () => {
    expect(await fetchKalshiMarketHistory("", "X")).toEqual([]);
    expect(await fetchKalshiMarketHistory("KXFED", "")).toEqual([]);
  });
  it("empty on fetch returning null", async () => {
    setHttpGetJson(async () => null);
    expect(await fetchKalshiMarketHistory("KXFED", "KXFED-X", { nowTs: 1735800000 })).toEqual([]);
  });
});
