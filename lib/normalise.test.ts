import { describe, it, expect } from "vitest";
import { normaliseKalshiMarket, normalisePolymarketMarket } from "./normalise";

const kalshiRaw = (over: Record<string, unknown> = {}) => ({
  ticker: "KXFED-26MAR-C5.00", event_ticker: "KXFED-26MAR",
  title: "Will the Fed cut rates in March?", status: "active",
  close_time: "2026-03-18T20:00:00Z", volume_fp: "12345.6", last_price_dollars: "0.4700", ...over,
});

describe("normaliseKalshiMarket", () => {
  it("full record", () => {
    const r = normaliseKalshiMarket(kalshiRaw(), "Rates/Fed");
    expect(r.id).toBe("KXFED-26MAR-C5.00");
    expect(r.platform).toBe("Kalshi");
    expect(r.category).toBe("Rates/Fed");
    expect(r.prob).toBeCloseTo(0.47);
    expect(r.volume).toBeCloseTo(12345.6);
    expect(r.endDate).toBe("2026-03-18");
    expect(r.status).toBe("active");
    expect(r.series).toBe("KXFED");
    expect(r.event).toBe("KXFED-26MAR");
  });
  it("category override wins", () =>
    expect(normaliseKalshiMarket(kalshiRaw({ title: "ambiguous" }), "Inflation").category).toBe("Inflation"));
  it("category inferred when not given", () =>
    expect(normaliseKalshiMarket(kalshiRaw()).category).toBe("Rates/Fed"));
  it("price clamped", () =>
    expect(normaliseKalshiMarket(kalshiRaw({ last_price_dollars: "1.40" })).prob).toBe(1));
  it("missing price is null", () => {
    const raw = kalshiRaw(); delete (raw as Record<string, unknown>).last_price_dollars;
    expect(normaliseKalshiMarket(raw).prob).toBeNull();
  });
  it("missing fields don't crash", () => {
    const r = normaliseKalshiMarket({ ticker: "KXFED-X" });
    expect(r.volume).toBe(0); expect(r.endDate).toBe(""); expect(r.prob).toBeNull();
  });
});

const polyRaw = (over: Record<string, unknown> = {}) => ({
  conditionId: "0xabc123", question: "Will there be a US recession in 2026?",
  outcomePrices: '["0.32", "0.68"]', volumeNum: 98765.4,
  endDate: "2026-12-31T00:00:00Z", active: true, closed: false, ...over,
});

describe("normalisePolymarketMarket", () => {
  it("full record", () => {
    const r = normalisePolymarketMarket(polyRaw());
    expect(r.id).toBe("0xabc123");
    expect(r.platform).toBe("Polymarket");
    expect(r.category).toBe("Growth/Recession");
    expect(r.prob).toBeCloseTo(0.32);
    expect(r.volume).toBeCloseTo(98765.4);
    expect(r.endDate).toBe("2026-12-31");
    expect(r.status).toBe("active");
    expect(r.series).toBe("");
  });
  it("closed status", () =>
    expect(normalisePolymarketMarket(polyRaw({ active: false, closed: true })).status).toBe("closed"));
  it("volume string fallback", () => {
    const raw = polyRaw(); delete (raw as Record<string, unknown>).volumeNum;
    (raw as Record<string, unknown>).volume = "555.5";
    expect(normalisePolymarketMarket(raw).volume).toBeCloseTo(555.5);
  });
  it("id falls back to slug", () => {
    const raw = polyRaw(); delete (raw as Record<string, unknown>).conditionId;
    (raw as Record<string, unknown>).slug = "us-recession-2026";
    expect(normalisePolymarketMarket(raw).id).toBe("us-recession-2026");
  });
});
