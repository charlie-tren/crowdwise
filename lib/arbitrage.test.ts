import { describe, it, expect } from "vitest";
import { findDiscrepancies } from "./arbitrage";
import type { Market } from "./types";

let seq = 0;
const m = (overrides: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`,
    platform: "Kalshi",
    title: "Untitled market",
    category: "Rates/Fed",
    prob: 0.5,
    volume: 1000,
    endDate: "",
    status: "active",
    series: "KX",
    event: "",
    ...overrides,
  };
};

describe("findDiscrepancies", () => {
  it("returns a clear match with the expected spread and a passing score", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.30,
      endDate: "2026-09-16",
    });
    const poly = m({
      platform: "Polymarket",
      title: "Fed cuts 25 bps in September 2026?",
      category: "Rates/Fed",
      prob: 0.48,
      endDate: "2026-09-30",
    });
    const out = findDiscrepancies([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].kalshi.id).toBe(kalshi.id);
    expect(out[0].polymarket.id).toBe(poly.id);
    expect(out[0].spread).toBeCloseTo(0.18, 5);
    expect(out[0].score).toBeGreaterThanOrEqual(0.55);
  });

  it("excludes a pair when categories differ", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.30,
      endDate: "2026-09-16",
    });
    const poly = m({
      platform: "Polymarket",
      title: "Fed cuts 25 bps in September 2026?",
      category: "Inflation",
      prob: 0.48,
      endDate: "2026-09-30",
    });
    const out = findDiscrepancies([kalshi, poly]);
    expect(out).toHaveLength(0);
  });

  it("excludes a pair when both are dated but more than maxDays apart", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.30,
      endDate: "2026-09-16",
    });
    const poly = m({
      platform: "Polymarket",
      title: "Fed cuts 25 bps in September 2026?",
      category: "Rates/Fed",
      prob: 0.48,
      endDate: "2027-03-16", // ~6 months later
    });
    const out = findDiscrepancies([kalshi, poly]);
    expect(out).toHaveLength(0);
  });

  it("excludes a pair whose spread is below minSpread", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.40,
      endDate: "2026-09-16",
    });
    const poly = m({
      platform: "Polymarket",
      title: "Fed cuts 25 bps in September 2026?",
      category: "Rates/Fed",
      prob: 0.43,
      endDate: "2026-09-30",
    });
    const out = findDiscrepancies([kalshi, poly]);
    expect(out).toHaveLength(0);
  });

  it("dedups so a Polymarket market only pairs with its single best Kalshi match", () => {
    const polyGeneric = m({
      platform: "Polymarket",
      title: "Will the Fed cut rates at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.48,
      endDate: "2026-09-30",
    });
    const kalshiClose = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.30,
      endDate: "2026-09-16",
    });
    const kalshiFarther = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 50 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.10,
      endDate: "2026-09-16",
    });
    const out = findDiscrepancies([polyGeneric, kalshiClose, kalshiFarther]);
    expect(out).toHaveLength(1);
  });

  it("sorts results by spread descending when multiple pairs pass", () => {
    const kSmall = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: 0.40,
      endDate: "2026-09-16",
    });
    const pSmall = m({
      platform: "Polymarket",
      title: "Fed cuts 25 bps in September 2026?",
      category: "Rates/Fed",
      prob: 0.50,
      endDate: "2026-09-30",
    });
    const kBig = m({
      platform: "Kalshi",
      title: "Will core CPI year over year come in above 3% in October 2026?",
      category: "Inflation",
      prob: 0.20,
      endDate: "2026-10-14",
    });
    const pBig = m({
      platform: "Polymarket",
      title: "Core CPI YoY above 3% in October 2026?",
      category: "Inflation",
      prob: 0.55,
      endDate: "2026-10-15",
    });
    const out = findDiscrepancies([kSmall, pSmall, kBig, pBig]);
    expect(out).toHaveLength(2);
    expect(out[0].spread).toBeGreaterThan(out[1].spread);
    expect(out[0].kalshi.id).toBe(kBig.id);
  });

  it("skips markets with a null prob or empty title", () => {
    const kalshiNullProb = m({
      platform: "Kalshi",
      title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
      category: "Rates/Fed",
      prob: null,
      endDate: "2026-09-16",
    });
    const poly = m({
      platform: "Polymarket",
      title: "Fed cuts 25 bps in September 2026?",
      category: "Rates/Fed",
      prob: 0.48,
      endDate: "2026-09-30",
    });
    const out = findDiscrepancies([kalshiNullProb, poly]);
    expect(out).toHaveLength(0);
  });
});
