import { describe, it, expect } from "vitest";
import {
  parseFedProposition,
  parseFedAnyCutProposition,
  findCrossVenue,
} from "./crossVenue";
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
      // Carried for display only; `bps` stays -1 so the proposition key, and so
      // cross-venue matching, is unchanged.
      openEndedFromBps: 25,
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

  it("returns null for an ECB decision market (not the US Fed)", () => {
    const market = m({
      platform: "Polymarket",
      title: "Will the ECB announce a 25 bps increase at the July 2026 meeting?",
      endDate: "2026-07-24",
    });
    expect(parseFedProposition(market)).toBeNull();
  });

  it("returns null for a Bank of Japan rates market", () => {
    const market = m({
      platform: "Polymarket",
      title: "No change in Bank of Japan's interest rates after the July 2026 meeting?",
      endDate: "2026-07-31",
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

  it("does NOT pair an ECB market with a Kalshi Fed market on the same bps/month", () => {
    const kalshiFed = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 25bps at their July 2026 meeting?",
      endDate: "2026-07-29",
      prob: 0.06,
    });
    const polyECB = m({
      platform: "Polymarket",
      title: "Will the ECB announce a 25 bps increase at the July 2026 meeting?",
      endDate: "2026-07-24",
      prob: 0.76,
    });
    const out = findCrossVenue([kalshiFed, polyECB]);
    expect(out).toHaveLength(0);
  });

  it("does NOT pair a Japan recession with a US recession of the same year", () => {
    const kalshiUS = m({
      platform: "Kalshi",
      category: "Growth/Recession",
      title: "Will the US be in a recession in 2026?",
      endDate: "2026-12-31",
      prob: 0.32,
    });
    const polyJapan = m({
      platform: "Polymarket",
      category: "Growth/Recession",
      title: "Japan recession in 2026?",
      endDate: "2026-12-31",
      prob: 0.09,
    });
    const out = findCrossVenue([kalshiUS, polyJapan]);
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

describe("parseFedAnyCutProposition", () => {
  it("parses Kalshi's 'cut rates before <year+1>' as the positive polarity, keyed to year-1 (trap 3: 'before YYYY' is the year BEFORE)", () => {
    const market = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve cut rates before 2027?",
      endDate: "2027-01-01",
    });
    expect(parseFedAnyCutProposition(market)).toEqual({ year: "2026", polarity: 1 });
  });

  it("parses Polymarket's 'no Fed rate cuts happen in <year>' as the negated polarity, keyed to the stated year directly", () => {
    const market = m({
      platform: "Polymarket",
      title: "Will no Fed rate cuts happen in 2026?",
      endDate: "2027-01-01",
    });
    expect(parseFedAnyCutProposition(market)).toEqual({ year: "2026", polarity: -1 });
  });

  it("never keys a 'before 2027' market the same as an actual 'in 2027' one (trap 3, other direction)", () => {
    const before2027 = parseFedAnyCutProposition(
      m({ platform: "Kalshi", title: "Will the Federal Reserve cut rates before 2027?", endDate: "2027-01-01" }),
    );
    const in2027 = parseFedAnyCutProposition(
      m({ platform: "Polymarket", title: "Will no Fed rate cuts happen in 2027?", endDate: "2028-01-01" }),
    );
    expect(before2027?.year).not.toBe(in2027?.year);
  });

  it("does NOT match the count-ladder's exactly-one rung (trap 2: exactly-one is not at-least-one)", () => {
    const market = m({
      platform: "Polymarket",
      title: "Will 1 Fed rate cut happen in 2026?",
      endDate: "2027-01-01",
    });
    expect(parseFedAnyCutProposition(market)).toBeNull();
  });

  it("does NOT match the count-ladder's open-ended top rung", () => {
    const market = m({
      platform: "Polymarket",
      title: "Will 12 or more Fed rate cuts happen in 2026?",
      endDate: "2027-01-01",
    });
    expect(parseFedAnyCutProposition(market)).toBeNull();
  });

  it("does NOT match any other rung of the count ladder (2 through 11)", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const market = m({
        platform: "Polymarket",
        title: `Will ${n} Fed rate cuts happen in 2026?`,
        endDate: "2027-01-01",
      });
      expect(parseFedAnyCutProposition(market)).toBeNull();
    }
  });

  it("does NOT steal the 'no change' HOLD market (trap 1: a generic no/not rule would break the existing Hold pairing)", () => {
    const market = m({
      platform: "Polymarket",
      title: "Will there be no change in Fed interest rates after the October 2026 meeting?",
      endDate: "2026-10-29",
    });
    expect(parseFedAnyCutProposition(market)).toBeNull();
  });

  it("does NOT match the emergency-cut qualifier (trap 4: a narrower proposition than at-least-one)", () => {
    const market = m({
      platform: "Polymarket",
      title: "Fed emergency rate cut before 2027?",
      endDate: "2027-01-01",
    });
    expect(parseFedAnyCutProposition(market)).toBeNull();
  });

  it("does NOT match a Bank of England 'raise before 2027' market (trap 5: same shape, different central bank)", () => {
    const market = m({
      platform: "Kalshi",
      title: "Will the Bank of England raise the Bank Rate before 2027?",
      endDate: "2027-01-01",
    });
    expect(parseFedAnyCutProposition(market)).toBeNull();
  });

  it("does NOT match Bank of Canada, RBA, Riksbank, SNB or Norges Bank 'raise before 2027' markets (trap 5, all six live titles)", () => {
    const titles = [
      "Will the Bank of Canada raise its target for the overnight rate before 2027?",
      "Will the Reserve Bank of Australia raise its cash rate target before 2027?",
      "Will the Riksbank raise its policy rate before 2027?",
      "Will the Swiss National Bank raise the SNB policy rate before 2027?",
      "Will Norges Bank raise its policy rate before 2027?",
    ];
    for (const title of titles) {
      const market = m({ platform: "Kalshi", title, endDate: "2027-01-01" });
      expect(parseFedAnyCutProposition(market)).toBeNull();
    }
  });
});

describe("findCrossVenue: at-least-one-cut-by-year family (polarity)", () => {
  it("pairs Kalshi 'cut rates before 2027' with Polymarket 'no Fed rate cuts happen in 2026' on key fed|2026|cut|any", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve cut rates before 2027?",
      endDate: "2027-01-01",
      prob: 0.054,
      volume: 1340950.11,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will no Fed rate cuts happen in 2026?",
      endDate: "2027-01-01",
      prob: 0.965,
      volume: 8480522.99,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("fed|2026|cut|any");
    expect(out[0].kalshi.id).toBe(kalshi.id);
    expect(out[0].polymarket.id).toBe(poly.id);
  });

  it("uses the comparable (1-prob) Polymarket probability, not the raw quoted one - a printed number must be one the venue actually quotes", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve cut rates before 2027?",
      endDate: "2027-01-01",
      prob: 0.054,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will no Fed rate cuts happen in 2026?",
      endDate: "2027-01-01",
      prob: 0.965,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].kalshiProb).toBeCloseTo(0.054, 5);
    expect(out[0].polymarketProb).toBeCloseTo(0.035, 5); // 1 - 0.965, NOT 0.965
    expect(out[0].kalshiInverted).toBe(false);
    expect(out[0].polymarketInverted).toBe(true);
    expect(out[0].divergence).toBeCloseTo(Math.abs(0.054 - 0.035), 5);
  });

  it("does not pair the any-cut market with a count-ladder rung (they share a category but not a key)", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve cut rates before 2027?",
      endDate: "2027-01-01",
      prob: 0.054,
    });
    const polyOne = m({
      platform: "Polymarket",
      title: "Will 1 Fed rate cut happen in 2026?",
      endDate: "2027-01-01",
      prob: 0.0105,
    });
    const out = findCrossVenue([kalshi, polyOne]);
    expect(out).toHaveLength(0);
  });

  it("does not pair the any-cut market with an emergency-cut market", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve cut rates before 2027?",
      endDate: "2027-01-01",
      prob: 0.054,
    });
    const polyEmergency = m({
      platform: "Polymarket",
      title: "Fed emergency rate cut before 2027?",
      endDate: "2027-01-01",
      prob: 0.0335,
    });
    const out = findCrossVenue([kalshi, polyEmergency]);
    expect(out).toHaveLength(0);
  });

  it("does not pair a Bank of England 'raise before 2027' market with the Fed any-cut key", () => {
    const boe = m({
      platform: "Kalshi",
      title: "Will the Bank of England raise the Bank Rate before 2027?",
      endDate: "2027-01-01",
      prob: 0.78,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will no Fed rate cuts happen in 2026?",
      endDate: "2027-01-01",
      prob: 0.965,
    });
    const out = findCrossVenue([boe, poly]);
    expect(out).toHaveLength(0);
  });

  it("still pairs the existing hold-on-both-venues market correctly, unaffected by the new family (regression)", () => {
    const kalshi = m({
      platform: "Kalshi",
      title: "Will the Federal Reserve Hike rates by 0bps at their October 2026 meeting?",
      endDate: "2026-10-28",
      prob: 0.48,
    });
    const poly = m({
      platform: "Polymarket",
      title: "Will there be no change in Fed interest rates after the October 2026 meeting?",
      endDate: "2026-10-29",
      prob: 0.455,
    });
    const out = findCrossVenue([kalshi, poly]);
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe("hold");
    expect(out[0].kalshiInverted).toBe(false);
    expect(out[0].polymarketInverted).toBe(false);
  });

  it("the six pairs findCrossVenue produces today are unchanged in count and are all non-inverted (no polarity family touches them)", () => {
    const kalshi1 = m({ platform: "Kalshi", title: "Will the Federal Reserve Hike rates by 25bps at their July 2026 meeting?", endDate: "2026-07-29", prob: 0.04 });
    const poly1 = m({ platform: "Polymarket", title: "Will the Fed increase interest rates by 25 bps after the July 2026 meeting?", endDate: "2026-07-30", prob: 0.0385 });
    const kalshi2 = m({ platform: "Kalshi", title: "Will the Federal Reserve Hike rates by 0bps at their July 2026 meeting?", endDate: "2026-07-29", prob: 0.95 });
    const poly2 = m({ platform: "Polymarket", title: "Will there be no change in Fed interest rates after the July 2026 meeting?", endDate: "2026-07-30", prob: 0.9585 });
    const out = findCrossVenue([kalshi1, poly1, kalshi2, poly2]);
    expect(out).toHaveLength(2);
    for (const pair of out) {
      expect(pair.kalshiInverted).toBe(false);
      expect(pair.polymarketInverted).toBe(false);
    }
  });
});
