import { describe, it, expect } from "vitest";
import { resolveThesis, resolveTheses, THESES } from "./thesis";
import type { Market } from "./types";

let seq = 0;
const m = (overrides: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`,
    platform: "Kalshi",
    title: "Untitled",
    category: "Rates/Fed",
    prob: 0.5,
    volume: 1000,
    endDate: "2026-12-31",
    status: "active",
    series: "KX",
    event: "",
    ...overrides,
  };
};

const recession = (prob: number, vol = 1000) =>
  m({ category: "Growth/Recession", title: "US recession by end of 2026?", prob, volume: vol });
const fedEase = (prob: number) =>
  m({ category: "Rates/Fed", title: "Will the Fed cut rates before 2027?", prob });
const noCuts = (prob: number) =>
  m({ category: "Rates/Fed", title: "Will no Fed rate cuts happen in 2026?", prob });
const unemp = (prob: number) =>
  m({ category: "Growth/Recession", title: "Will US unemployment reach at least 5.0% in 2026?", prob });

const byKey = (key: string) => THESES.find((t) => t.key === key)!;

describe("resolveThesis", () => {
  it("resolves legs and multiplies for the joint (YES side)", () => {
    const out = resolveThesis(byKey("recession"), [recession(0.4), fedEase(0.8)]);
    expect(out.resolvedCount).toBe(2);
    expect(out.jointProb).toBeCloseTo(0.32, 5);
    expect(out.legs.map((l) => l.market?.title)).toEqual([
      "US recession by end of 2026?",
      "Will the Fed cut rates before 2027?",
    ]);
  });

  it("takes the complement for a NO leg (soft landing)", () => {
    const out = resolveThesis(byKey("soft-landing"), [recession(0.4), fedEase(0.8)]);
    // No recession = 1 - 0.4 = 0.6 ; Fed eases = 0.8 -> joint 0.48
    expect(out.legs[0].prob).toBeCloseTo(0.6, 5);
    expect(out.jointProb).toBeCloseTo(0.48, 5);
  });

  it("marks a thesis partial when a leg has no matching market", () => {
    const out = resolveThesis(byKey("hard-landing"), [recession(0.4)]); // no unemployment market
    expect(out.resolvedCount).toBe(1);
    expect(out.totalLegs).toBe(2);
    expect(out.legs[1].market).toBeNull();
    expect(out.jointProb).toBeCloseTo(0.4, 5); // joint over resolved legs only
  });

  it("picks the highest-volume market for a leg", () => {
    const out = resolveThesis(byKey("recession"), [recession(0.3, 100), recession(0.45, 900), fedEase(0.8)]);
    expect(out.legs[0].prob).toBeCloseTo(0.45, 5);
  });

  it("does not match the multi-bucket 'when will the next recession start' market", () => {
    const out = resolveThesis(byKey("recession"), [
      m({ category: "Growth/Recession", title: "When will the next U.S. recession start?", prob: 0.02, volume: 9999 }),
      recession(0.4, 100),
      fedEase(0.8),
    ]);
    expect(out.legs[0].market?.title).toBe("US recession by end of 2026?");
  });
});

describe("resolveTheses", () => {
  it("returns every defined thesis", () => {
    const out = resolveTheses([recession(0.4), fedEase(0.8), noCuts(0.85), unemp(0.1)]);
    expect(out.map((t) => t.key)).toEqual(THESES.map((t) => t.key));
    expect(out.every((t) => t.jointProb != null)).toBe(true);
  });
});
