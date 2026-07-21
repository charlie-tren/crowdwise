import { describe, it, expect } from "vitest";
import { ladderToDistribution, probsToDistribution } from "./distribution";
import { buildStrikeLadders } from "./relativeValue";
import type { Market } from "./types";

let seq = 0;
const cpi = (threshold: number, prob: number, vol = 1000): Market => {
  seq += 1;
  return {
    id: `KXCPI-26-${seq}`,
    platform: "Kalshi",
    title: `Will the rate of CPI inflation be above ${threshold}% for the year ending in July 2026?`,
    category: "Inflation",
    prob,
    volume: vol,
    endDate: "2026-07-14",
    status: "active",
    series: "KXCPI",
    event: "",
  };
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("ladderToDistribution", () => {
  it("buckets a clean decreasing above-ladder into masses that sum to ~1", () => {
    // P(>3.0)=0.95, P(>3.5)=0.6, P(>4.0)=0.2 -> a well-behaved cumulative ladder
    const ladder = buildStrikeLadders([cpi(3.0, 0.95), cpi(3.5, 0.6), cpi(4.0, 0.2)])[0];
    const dist = ladderToDistribution(ladder);

    expect(dist.metric).toBe("CPI inflation");
    expect(dist.direction).toBe("above");
    // open bottom + two interior + open top
    expect(dist.buckets).toHaveLength(4);

    const masses = dist.buckets.map((b) => b.mass);
    // 0.05 (below 3.0), 0.35 (3.0-3.5), 0.40 (3.5-4.0), 0.20 (above 4.0)
    expect(masses[0]).toBeCloseTo(0.05, 6);
    expect(masses[1]).toBeCloseTo(0.35, 6);
    expect(masses[2]).toBeCloseTo(0.4, 6);
    expect(masses[3]).toBeCloseTo(0.2, 6);
    expect(sum(masses)).toBeCloseTo(1, 6);
  });

  it("emits open bottom and open top tails with the right edges", () => {
    const ladder = buildStrikeLadders([cpi(3.0, 0.9), cpi(3.5, 0.6), cpi(4.0, 0.2)])[0];
    const dist = ladderToDistribution(ladder);
    const bottom = dist.buckets[0];
    const top = dist.buckets[dist.buckets.length - 1];
    expect(bottom.lo).toBeNull();
    expect(bottom.hi).toBe(3.0);
    expect(top.lo).toBe(4.0);
    expect(top.hi).toBeNull();
    // interior buckets are fully bounded and ascend
    expect(dist.buckets[1]).toMatchObject({ lo: 3.0, hi: 3.5 });
    expect(dist.buckets[2]).toMatchObject({ lo: 3.5, hi: 4.0 });
  });
});

describe("probsToDistribution", () => {
  it("clamps a tiny inversion's negative mass to 0 (noise)", () => {
    // 3.5 priced 2pp RICHER than 3.0 on an 'above' ladder -> raw mass -0.02
    const dist = probsToDistribution(
      [
        { threshold: 3.0, prob: 0.5 },
        { threshold: 3.5, prob: 0.52 },
        { threshold: 4.0, prob: 0.2 },
      ],
      "above",
      "CPI inflation",
      "2026-07",
    );
    // interior bucket 3.0-3.5 would be 0.5 - 0.52 = -0.02, clamped to 0
    const inverted = dist.buckets.find((b) => b.lo === 3.0 && b.hi === 3.5);
    expect(inverted?.mass).toBe(0);
    expect(dist.buckets.every((b) => b.mass >= 0)).toBe(true);
  });

  it("handles a below-ladder analogously (increasing cumulative prob)", () => {
    // P(<4.0)=0.1, P(<4.5)=0.4, P(<5.0)=0.85 for an 'unemployment below' ladder
    const dist = probsToDistribution(
      [
        { threshold: 4.0, prob: 0.1 },
        { threshold: 4.5, prob: 0.4 },
        { threshold: 5.0, prob: 0.85 },
      ],
      "below",
      "Unemployment",
      "2026",
    );
    const masses = dist.buckets.map((b) => b.mass);
    // 0.10 (below 4.0), 0.30 (4.0-4.5), 0.45 (4.5-5.0), 0.15 (above 5.0)
    expect(masses[0]).toBeCloseTo(0.1, 6);
    expect(masses[1]).toBeCloseTo(0.3, 6);
    expect(masses[2]).toBeCloseTo(0.45, 6);
    expect(masses[3]).toBeCloseTo(0.15, 6);
    expect(sum(masses)).toBeCloseTo(1, 6);
  });

  it("returns empty buckets for an empty input", () => {
    const dist = probsToDistribution([], "above", "CPI inflation", "2026");
    expect(dist.buckets).toEqual([]);
  });
});
