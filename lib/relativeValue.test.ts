import { describe, it, expect } from "vitest";
import { parseStrike, buildStrikeLadders } from "./relativeValue";
import type { Market } from "./types";

let seq = 0;
const m = (overrides: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`,
    platform: "Kalshi",
    title: "Untitled",
    category: "Inflation",
    prob: 0.5,
    volume: 1000,
    endDate: "2026-07-14",
    status: "active",
    series: "KX",
    event: "",
    ...overrides,
  };
};

describe("parseStrike", () => {
  it("parses a CPI above-threshold market with month-year period", () => {
    const s = parseStrike(m({ title: "Will the rate of CPI inflation be above 3.5% for the year ending in July 2026?", prob: 0.25 }));
    expect(s).toMatchObject({ metric: "CPI inflation", direction: "above", threshold: 3.5, period: "2026-07", prob: 0.25 });
  });

  it("parses 'reach at least' as an above threshold with year-only period", () => {
    const s = parseStrike(m({ category: "Growth/Recession", title: "Will US unemployment reach at least 5.0% in 2026?", prob: 0.12 }));
    expect(s).toMatchObject({ metric: "Unemployment", direction: "above", threshold: 5, period: "2026" });
  });

  it("skips a 'between' range market", () => {
    expect(parseStrike(m({ title: "Will China's 2026 annual GDP growth (Y/Y) be between 4.0% and 4.5%?" }))).toBeNull();
  });

  it("skips a market with no recognised metric", () => {
    expect(parseStrike(m({ title: "Will the Fed hike by 25bps above expectations in July 2026?", category: "Rates/Fed" }))).toBeNull();
  });

  it("parses the '>' symbol form of an oil threshold, anchoring the number to the comparator", () => {
    const s = parseStrike(
      m({ title: "Will the WTI front-month settle oil price  be >116.99 on Nov 3, 2026?", category: "Commodities/Oil", prob: 0.08 }),
    );
    expect(s).toMatchObject({ metric: "Oil price", direction: "above", threshold: 116.99, prob: 0.08 });
  });

  it("parses the word form of a non-percentage oil threshold ('above ... USD/Bbl')", () => {
    const s = parseStrike(
      m({
        title: "Will the WTI crude oil settlement price be above 86.49 USD/Bbl on Sep 23, 2026?",
        category: "Commodities/Oil",
        prob: 0.85,
      }),
    );
    expect(s).toMatchObject({ metric: "Oil price", direction: "above", threshold: 86.49 });
  });

  it("never mistakes the day or year in a trailing date for the threshold", () => {
    const s = parseStrike(
      m({ title: "Will the WTI front-month settle oil price  be >116.99 on Nov 3, 2026?", category: "Commodities/Oil" }),
    );
    expect(s!.threshold).not.toBe(3);
    expect(s!.threshold).not.toBe(2026);
    expect(s!.threshold).toBe(116.99);
  });

  it("still parses an existing percentage title exactly as before (351 live markets depend on this path)", () => {
    const s = parseStrike(m({ title: "Will the rate of CPI inflation be above 3.5% for the year ending in July 2026?", prob: 0.25 }));
    expect(s).toMatchObject({ metric: "CPI inflation", direction: "above", threshold: 3.5, period: "2026-07", prob: 0.25 });
  });

  it("excludes oil production (a flow, barrels/day) from the Oil price metric", () => {
    const s = parseStrike(
      m({ title: "Will Venezuelan crude oil production reach 1.7m barrels per day in 2026?", category: "Commodities/Oil" }),
    );
    expect(s).toBeNull();
  });

  it("excludes oil reserves (a stock, barrels) from the Oil price metric", () => {
    const s = parseStrike(
      m({ title: "Will US crude oil reserves fall to 280M by September 25, 2026?", category: "Commodities/Oil" }),
    );
    expect(s).toBeNull();
  });

  it("parses the backward 'X% or higher' phrasing, where the threshold precedes the comparator", () => {
    const s = parseStrike(m({ title: "Will China’s 2026 annual GDP growth (Y/Y) be 9% or higher?", category: "Growth/Recession" }));
    expect(s).toMatchObject({ metric: "GDP growth", direction: "above", threshold: 9, period: "2026" });
  });

  it("keys the period off the settlement date, not just the year, so two different WTI settle dates in the same year don't merge", () => {
    const nov = parseStrike(
      m({ title: "Will the WTI front-month settle oil price  be >100.99 on Nov 3, 2026?", category: "Commodities/Oil" }),
    );
    const sep = parseStrike(
      m({ title: "Will the WTI crude oil settlement price be above 90.49 USD/Bbl on Sep 23, 2026?", category: "Commodities/Oil" }),
    );
    expect(nov!.period).not.toBe(sep!.period);
    expect(nov!.period).toBe("2026-11-03");
    expect(sep!.period).toBe("2026-09-23");
  });
});

describe("buildStrikeLadders", () => {
  const cpi = (threshold: number, prob: number, vol = 1000) =>
    m({ title: `Will the rate of CPI inflation be above ${threshold}% for the year ending in July 2026?`, prob, volume: vol });

  it("builds a monotone ladder with no violations", () => {
    const ladders = buildStrikeLadders([cpi(3.0, 0.6), cpi(3.5, 0.4), cpi(4.0, 0.2)]);
    expect(ladders).toHaveLength(1);
    expect(ladders[0].hasViolation).toBe(false);
    expect(ladders[0].rungs.map((r) => r.threshold)).toEqual([3.0, 3.5, 4.0]);
    expect(ladders[0].rungs.every((r) => !r.violation)).toBe(true);
  });

  it("flags a monotonicity violation (higher above-threshold priced richer)", () => {
    const ladders = buildStrikeLadders([cpi(3.0, 0.30), cpi(3.5, 0.45), cpi(4.0, 0.20)]);
    expect(ladders[0].hasViolation).toBe(true);
    const bad = ladders[0].rungs.find((r) => r.threshold === 3.5);
    expect(bad!.violation).toBe(true);
  });

  it("does not flag a sub-3pp inversion (within noise)", () => {
    // 3.5% priced 2pp richer than 3.0% - a technical inversion, but within noise
    const ladders = buildStrikeLadders([cpi(3.0, 0.40), cpi(3.5, 0.42), cpi(4.0, 0.20)]);
    expect(ladders[0].hasViolation).toBe(false);
  });

  it("ignores families with fewer than minRungs thresholds", () => {
    expect(buildStrikeLadders([cpi(3.0, 0.6), cpi(3.5, 0.4)])).toHaveLength(0);
  });

  it("keeps the highest-volume market per threshold", () => {
    const ladders = buildStrikeLadders([cpi(3.0, 0.6, 100), cpi(3.0, 0.55, 900), cpi(3.5, 0.4), cpi(4.0, 0.2)]);
    const rung = ladders[0].rungs.find((r) => r.threshold === 3.0);
    expect(rung!.prob).toBe(0.55);
  });

  const wti = (threshold: number, prob: number, vol = 1000) =>
    m({
      title: `Will the WTI front-month settle oil price  be >${threshold} on Nov 3, 2026?`,
      category: "Commodities/Oil",
      prob,
      volume: vol,
    });

  it("builds an oil price ladder from the '>' symbol form and never mixes in oil production", () => {
    const production = m({
      title: "Will Venezuelan crude oil production reach 1.7m barrels per day in 2026?",
      category: "Commodities/Oil",
      prob: 0.03,
    });
    const ladders = buildStrikeLadders([wti(114.99, 0.06), wti(115.99, 0.07), wti(116.99, 0.08), production]);
    expect(ladders).toHaveLength(1);
    expect(ladders[0].metric).toBe("Oil price");
    expect(ladders[0].rungs).toHaveLength(3);
    expect(ladders[0].rungs.some((r) => r.threshold === 1.7)).toBe(false);
  });

  it("does not flag the live 1pp WTI inversion (116.99 priced 1pp richer than 115.99)", () => {
    // Real board values: P(>116.99)=8% vs P(>115.99)=7% - a 1pp inversion, inside
    // the deliberate 3pp noise floor, and must stay unflagged.
    const ladders = buildStrikeLadders([wti(114.99, 0.06), wti(115.99, 0.07), wti(116.99, 0.08)]);
    expect(ladders[0].hasViolation).toBe(false);
  });

  it("flags a 5pp WTI inversion", () => {
    const ladders = buildStrikeLadders([wti(114.99, 0.06), wti(115.99, 0.07), wti(116.99, 0.12)]);
    expect(ladders[0].hasViolation).toBe(true);
    const bad = ladders[0].rungs.find((r) => r.threshold === 116.99);
    expect(bad!.violation).toBe(true);
  });

  it("sorts ladders with violations first", () => {
    const clean = [cpi(3.0, 0.6), cpi(3.5, 0.4), cpi(4.0, 0.2)];
    const dirty = [
      m({ category: "Growth/Recession", title: "Will US unemployment reach at least 4.0% in 2026?", prob: 0.3 }),
      m({ category: "Growth/Recession", title: "Will US unemployment reach at least 4.5% in 2026?", prob: 0.5 }),
      m({ category: "Growth/Recession", title: "Will US unemployment reach at least 5.0% in 2026?", prob: 0.1 }),
    ];
    const ladders = buildStrikeLadders([...clean, ...dirty]);
    expect(ladders[0].hasViolation).toBe(true);
    expect(ladders[0].metric).toBe("Unemployment");
  });
});
