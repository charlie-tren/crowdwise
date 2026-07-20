import { describe, it, expect } from "vitest";
import { parseFedProposition, parseProposition, findCrossVenue } from "./crossVenue";
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

describe("parseFedProposition", () => {
  it("parses a Kalshi hike-by-Nbps title", () => {
    const market = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 25bps at their July 2026 meeting?",
      endDate: "2026-07-29",
    });
    expect(parseFedProposition(market)).toEqual({
      ym: "2026-07",
      action: "hike",
      bps: 25,
    });
  });

  it("parses a Kalshi hike-by-0bps title as hold", () => {
    const market = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 0bps at their July 2026 meeting?",
      endDate: "2026-07-29",
    });
    expect(parseFedProposition(market)).toEqual({
      ym: "2026-07",
      action: "hold",
      bps: 0,
    });
  });

  it("parses a Kalshi open-ended cut bucket (>25bps) with bps -1", () => {
    const market = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Cut rates by >25bps at their July 2026 meeting?",
      endDate: "2026-07-29",
    });
    expect(parseFedProposition(market)).toEqual({
      ym: "2026-07",
      action: "cut",
      bps: -1,
    });
  });

  it("parses a Polymarket no-change title as hold", () => {
    const market = m({
      platform: "Polymarket",
      title: "Will there be no change in Fed interest rates after the July 2026 meeting?",
      endDate: "2026-07-30",
    });
    expect(parseFedProposition(market)).toEqual({
      ym: "2026-07",
      action: "hold",
      bps: 0,
    });
  });

  it("parses a Polymarket increase-by-Nbps title", () => {
    const market = m({
      platform: "Polymarket",
      title: "Will the Fed increase interest rates by 25 bps after the July 2026 meeting?",
      endDate: "2026-07-30",
    });
    expect(parseFedProposition(market)).toEqual({
      ym: "2026-07",
      action: "hike",
      bps: 25,
    });
  });

  it("returns null for a non-Fed/unparseable title", () => {
    const market = m({
      title: "Will core CPI YoY come in above 3% in October 2026?",
      category: "Inflation",
      endDate: "2026-10-14",
    });
    expect(parseFedProposition(market)).toBeNull();
  });

  it("returns null for a Fed hike title with no bps figure", () => {
    const market = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates at their July 2026 meeting?",
      endDate: "2026-07-29",
    });
    expect(parseFedProposition(market)).toBeNull();
  });
});

describe("findCrossVenue", () => {
  it("does NOT pair a hike with a hold, even at extreme opposite probabilities (regression: previously matched as a false 92pp arb)", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 25bps at their July 2026 meeting?",
      endDate: "2026-07-29",
      prob: 0.04,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will there be no change in Fed interest rates after the July 2026 meeting?",
      endDate: "2026-07-30",
      prob: 0.96,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(0);
  });

  it("pairs a Kalshi hike-25bps with a Polymarket increase-25bps on the same proposition", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 25bps at their July 2026 meeting?",
      endDate: "2026-07-29",
      prob: 0.04,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will the Fed increase interest rates by 25 bps after the July 2026 meeting?",
      endDate: "2026-07-30",
      prob: 0.0385,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].kalshi.id).toBe(kalshi.id);
    expect(out[0].polymarket.id).toBe(poly.id);
    expect(out[0].divergence).toBeCloseTo(0.0015, 4);
  });

  it("pairs a hold on both venues", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 0bps at their July 2026 meeting?",
      endDate: "2026-07-29",
      prob: 0.95,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will there be no change in Fed interest rates after the July 2026 meeting?",
      endDate: "2026-07-30",
      prob: 0.9585,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe("hold");
    expect(out[0].divergence).toBeCloseTo(0.0085, 4);
  });

  it("emits a genuine divergence for the same proposition", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Cut rates by 25bps at their September 2026 meeting?",
      endDate: "2026-09-16",
      prob: 0.30,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will the Fed decrease interest rates by 25 bps after the September 2026 meeting?",
      endDate: "2026-09-30",
      prob: 0.45,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].divergence).toBeCloseTo(0.15, 5);
  });

  it("does not match the same proposition across different meeting months", () => {
    const kalshiJuly = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 25bps at their July 2026 meeting?",
      endDate: "2026-07-29",
      prob: 0.04,
    });
    const polySeptember = m({
      platform: "Polymarket",
      title: "Will the Fed increase interest rates by 25 bps after the September 2026 meeting?",
      endDate: "2026-09-30",
      prob: 0.10,
    });
    const out = findCrossVenue([kalshiJuly, polySeptember]);
    expect(out).toHaveLength(0);
  });

  it("pairs the same recession-year proposition across venues", () => {
    const kalshi = m({
      platform: "Kalshi",
      category: "Growth/Recession",
      title: "Will the US be in a recession in 2026?",
      endDate: "2026-12-31",
      prob: 0.32,
    });
    const poly = m({
      platform: "Polymarket",
      category: "Growth/Recession",
      title: "US recession in 2026?",
      endDate: "2026-12-31",
      prob: 0.4,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("recession");
    expect(out[0].label).toBe("US recession in 2026");
    expect(out[0].divergence).toBeCloseTo(0.08, 5);
  });

  it("does NOT pair an annual recession market with a quarterly one (different propositions)", () => {
    const kalshiQ = m({
      platform: "Kalshi",
      category: "Growth/Recession",
      title: "Will the US be in a recession in Q3 2026?",
      endDate: "2026-09-30",
      prob: 0.2,
    });
    const polyAnnual = m({
      platform: "Polymarket",
      category: "Growth/Recession",
      title: "US recession in 2026?",
      endDate: "2026-12-31",
      prob: 0.4,
    });
    const out = findCrossVenue([kalshiQ, polyAnnual]);
    expect(out).toHaveLength(0);
  });

  it("does not pair a Fed proposition with a recession one", () => {
    const fed = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Cut rates by 25bps at their 2026 meeting?",
      endDate: "2026-09-16",
      prob: 0.3,
    });
    const rec = m({
      platform: "Polymarket",
      category: "Growth/Recession",
      title: "US recession in 2026?",
      endDate: "2026-12-31",
      prob: 0.3,
    });
    const out = findCrossVenue([fed, rec]);
    expect(out).toHaveLength(0);
  });

  it("sorts multiple pairs by divergence descending", () => {
    const kalshiSmall = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 25bps at their July 2026 meeting?",
      endDate: "2026-07-29",
      prob: 0.04,
    });
    const polySmall = m({
      platform: "Polymarket",
      title: "Will the Fed increase interest rates by 25 bps after the July 2026 meeting?",
      endDate: "2026-07-30",
      prob: 0.0385,
    });
    const kalshiBig = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Cut rates by 25bps at their September 2026 meeting?",
      endDate: "2026-09-16",
      prob: 0.30,
    });
    const polyBig = m({
      platform: "Polymarket",
      title: "Will the Fed decrease interest rates by 25 bps after the September 2026 meeting?",
      endDate: "2026-09-30",
      prob: 0.45,
    });
    const out = findCrossVenue([kalshiSmall, polySmall, kalshiBig, polyBig]);
    expect(out).toHaveLength(2);
    expect(out[0].divergence).toBeGreaterThan(out[1].divergence);
    expect(out[0].kalshi.id).toBe(kalshiBig.id);
  });
});
