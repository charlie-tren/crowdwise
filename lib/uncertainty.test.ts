import { describe, it, expect } from "vitest";
import { uncertaintyIndex } from "./uncertainty";
import type { Market } from "./types";

const mkt = (over: Partial<Market>): Market => ({
  id: "id",
  platform: "Kalshi",
  title: "t",
  category: "Rates/Fed",
  prob: 0.5,
  volume: 1000,
  endDate: "2026-12-31",
  status: "active",
  series: "s",
  event: "e",
  ...over,
});

describe("uncertaintyIndex", () => {
  it("all markets at 50% -> ~1.0", () => {
    const r = uncertaintyIndex([
      mkt({ id: "a", prob: 0.5, volume: 100 }),
      mkt({ id: "b", prob: 0.5, volume: 900 }),
    ]);
    expect(r.index).toBeCloseTo(1, 10);
    expect(r.count).toBe(2);
  });

  it("all markets at the extremes -> ~0", () => {
    const r = uncertaintyIndex([
      mkt({ id: "a", prob: 0, volume: 500 }),
      mkt({ id: "b", prob: 1, volume: 500 }),
    ]);
    expect(r.index).toBeCloseTo(0, 10);
    expect(r.count).toBe(2);
  });

  it("is volume-weighted, not a simple mean", () => {
    // One tiny contested market, one huge resolved market -> index near 0.
    const r = uncertaintyIndex([
      mkt({ id: "contested", prob: 0.5, volume: 1 }),
      mkt({ id: "resolved", prob: 1, volume: 999 }),
    ]);
    // contestedness: contested=1, resolved=0. weighted = 1*1 + 0*999 = 1; total = 1000.
    expect(r.index).toBeCloseTo(1 / 1000, 10);
    // Flip the weights: the contested market now dominates.
    const r2 = uncertaintyIndex([
      mkt({ id: "contested", prob: 0.5, volume: 999 }),
      mkt({ id: "resolved", prob: 1, volume: 1 }),
    ]);
    expect(r2.index).toBeCloseTo(999 / 1000, 10);
  });

  it("a market at 25% contributes 0.5 contestedness", () => {
    const r = uncertaintyIndex([mkt({ prob: 0.25, volume: 100 })]);
    expect(r.index).toBeCloseTo(0.5, 10);
  });

  it("skips markets with null prob or non-positive volume", () => {
    const r = uncertaintyIndex([
      mkt({ id: "a", prob: 0.5, volume: 100 }),
      mkt({ id: "b", prob: null, volume: 100 }),
      mkt({ id: "c", prob: 0.5, volume: 0 }),
      mkt({ id: "d", prob: 0.5, volume: -50 }),
    ]);
    expect(r.count).toBe(1);
    expect(r.index).toBeCloseTo(1, 10);
  });

  it("empty / all-ineligible input -> zeroed result, no divide-by-zero", () => {
    expect(uncertaintyIndex([])).toEqual({ index: 0, count: 0 });
    expect(uncertaintyIndex([mkt({ prob: null })])).toEqual({ index: 0, count: 0 });
  });

  it("index stays within [0,1]", () => {
    const r = uncertaintyIndex([
      mkt({ id: "a", prob: 0.5, volume: 10 }),
      mkt({ id: "b", prob: 0.1, volume: 20 }),
      mkt({ id: "c", prob: 0.9, volume: 30 }),
    ]);
    expect(r.index).toBeGreaterThanOrEqual(0);
    expect(r.index).toBeLessThanOrEqual(1);
  });
});
