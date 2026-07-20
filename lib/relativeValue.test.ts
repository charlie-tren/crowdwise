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
