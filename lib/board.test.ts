import { describe, it, expect, afterEach } from "vitest";
import { fetchTopMarkets, groupByCategory, representativeByEvent } from "./board";
import * as sources from "./sources";

afterEach(() => sources.resetHttpGetJson());

describe("fetchTopMarkets", () => {
  it("filters, sorts, and combines (drops Other despite volume)", async () => {
    sources.setHttpGetJson(async (url, params) => {
      if (url.includes("elections.kalshi")) {
        return { markets: [{ ticker: "KXFED-A", title: "Fed cut?", last_price_dollars: "0.5", volume_fp: "30", status: "active" }] };
      }
      return [
        { conditionId: "0x1", question: "US recession in 2026?", outcomePrices: '["0.3","0.7"]', volumeNum: 100, active: true },
        { conditionId: "0x2", question: "Lakers win?", outcomePrices: '["0.5","0.5"]', volumeNum: 9999, active: true },
      ];
    });
    const out = await fetchTopMarkets();
    expect(out.map((r) => r.category)).not.toContain("Other");
    expect(out.map((r) => r.id)).toEqual(["0x1", "KXFED-A"]); // 100 > 30
  });

  it("polymarket failing is not fatal", async () => {
    sources.setHttpGetJson(async (url) => {
      if (url.includes("elections.kalshi")) {
        return { markets: [{ ticker: "KXFED-A", last_price_dollars: "0.5", volume_fp: "10", status: "active" }] };
      }
      throw new Error("network down");
    });
    const out = await fetchTopMarkets();
    expect(out.length).toBe(1);
    expect(out[0].category).toBe("Rates/Fed");
  });

  it("drops a near-extreme Elections/Politics longshot despite high volume", async () => {
    sources.setHttpGetJson(async (url) => {
      if (url.includes("elections.kalshi")) return { markets: [] };
      return [
        {
          conditionId: "0xlongshot", question: "Will Jane Doe win the 2028 presidential election?",
          outcomePrices: '["0.01","0.99"]', volumeNum: 50000, active: true,
        },
      ];
    });
    const out = await fetchTopMarkets();
    expect(out.map((r) => r.id)).not.toContain("0xlongshot");
  });

  it("keeps an Elections/Politics market at a non-extreme probability", async () => {
    sources.setHttpGetJson(async (url) => {
      if (url.includes("elections.kalshi")) return { markets: [] };
      return [
        {
          conditionId: "0xcompetitive", question: "Will Jane Doe win the 2028 presidential election?",
          outcomePrices: '["0.45","0.55"]', volumeNum: 50000, active: true,
        },
      ];
    });
    const out = await fetchTopMarkets();
    const kept = out.find((r) => r.id === "0xcompetitive");
    expect(kept).toBeDefined();
    expect(kept?.category).toBe("Elections/Politics");
  });

  it("keeps a Rates/Fed market at prob 0.01 (filter is Elections-only)", async () => {
    sources.setHttpGetJson(async (url) => {
      if (url.includes("elections.kalshi")) {
        return { markets: [{ ticker: "KXFED-A", title: "Fed cut?", last_price_dollars: "0.01", volume_fp: "30", status: "active" }] };
      }
      return [];
    });
    const out = await fetchTopMarkets();
    expect(out.map((r) => r.id)).toContain("KXFED-A");
  });
});

describe("groupByCategory", () => {
  it("groups in category order and omits empty", () => {
    const records = [
      { category: "Elections/Politics", id: "p1" },
      { category: "Rates/Fed", id: "f1" },
      { category: "Rates/Fed", id: "f2" },
    ] as any;
    const grouped = groupByCategory(records);
    expect(Object.keys(grouped)).toEqual(["Rates/Fed", "Elections/Politics"]);
    expect(grouped["Rates/Fed"].map((r: any) => r.id)).toEqual(["f1", "f2"]);
    expect("Inflation" in grouped).toBe(false);
  });
  it("per-category cap", () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ category: "Rates/Fed", id: `f${i}` })) as any;
    expect(groupByCategory(records, 3)["Rates/Fed"].length).toBe(3);
  });
});

describe("representativeByEvent", () => {
  it("picks highest-volume per event", () => {
    const records = [
      { id: "a", event: "E1", volume: 10 }, { id: "b", event: "E1", volume: 99 }, { id: "c", event: "E2", volume: 5 },
    ] as any;
    expect(new Set(representativeByEvent(records).map((r) => r.id))).toEqual(new Set(["b", "c"]));
  });
  it("eventless records pass through", () => {
    const records = [
      { id: "p1", event: "", volume: 1 }, { id: "p2", event: "", volume: 2 },
      { id: "k1", event: "E1", volume: 3 }, { id: "k2", event: "E1", volume: 4 },
    ] as any;
    expect(new Set(representativeByEvent(records).map((r) => r.id))).toEqual(new Set(["p1", "p2", "k2"]));
  });
});
