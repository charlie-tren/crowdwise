import { describe, it, expect } from "vitest";
import { makeRng, sampleTriangular, percentile } from "./rng";

describe("makeRng", () => {
  it("is deterministic for a seed", () => {
    const a = makeRng(42), b = makeRng(42);
    const runA = [a(), a(), a()];
    const runB = [b(), b(), b()];
    expect(runA).toEqual(runB);
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });

  it("stays inside [0,1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("sampleTriangular", () => {
  it("returns the point when low = likely = high", () => {
    const r = makeRng(1);
    expect(sampleTriangular(0.3, 0.3, 0.3, r())).toBeCloseTo(0.3);
  });

  it("stays within the bounds", () => {
    const r = makeRng(3);
    for (let i = 0; i < 2000; i++) {
      const v = sampleTriangular(0.2, 0.25, 0.6, r());
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThanOrEqual(0.6);
    }
  });

  it("has mean (low + likely + high) / 3", () => {
    const r = makeRng(11);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += sampleTriangular(0.2, 0.25, 0.6, r());
    expect(sum / n).toBeCloseTo((0.2 + 0.25 + 0.6) / 3, 2);
  });
});

describe("percentile", () => {
  it("reads the nearest rank on a sorted copy", () => {
    const xs = [5, 1, 4, 2, 3];
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 1)).toBe(5);
    expect(percentile(xs, 0.5)).toBe(3);
  });

  it("returns null for an empty sample", () => {
    expect(percentile([], 0.5)).toBeNull();
  });
});
