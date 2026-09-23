import { describe, it, expect } from "vitest";
import { fractionFromClientX, likelyForKey, shiftRange } from "./dragMath";

describe("fractionFromClientX", () => {
  it("maps a pointer position to a 0..1 fraction of the track rect", () => {
    expect(fractionFromClientX(50, { left: 0, width: 100 })).toBeCloseTo(0.5);
    expect(fractionFromClientX(0, { left: 0, width: 100 })).toBeCloseTo(0);
    expect(fractionFromClientX(100, { left: 0, width: 100 })).toBeCloseTo(1);
  });

  it("accounts for the track's own left offset, eg. a scrolled container", () => {
    expect(fractionFromClientX(150, { left: 100, width: 100 })).toBeCloseTo(0.5);
    // A track scrolled far to the left of the viewport still resolves correctly:
    // this is the same arithmetic a sideways-scrolled MapView needs.
    expect(fractionFromClientX(-400, { left: -500, width: 100 })).toBeCloseTo(1);
  });

  it("clamps outside the track instead of returning a value outside 0..1", () => {
    expect(fractionFromClientX(-50, { left: 0, width: 100 })).toBe(0);
    expect(fractionFromClientX(500, { left: 0, width: 100 })).toBe(1);
  });

  it("returns 0 rather than NaN for a zero-width track, as jsdom always reports", () => {
    expect(fractionFromClientX(50, { left: 0, width: 0 })).toBe(0);
  });
});

describe("shiftRange", () => {
  it("shifts low and high by the same amount as likely, preserving the width", () => {
    const range = { low: 0.2, likely: 0.35, high: 0.5 };
    const next = shiftRange(range, 0.45);
    expect(next.likely).toBeCloseTo(0.45);
    expect(next.high - next.low).toBeCloseTo(range.high - range.low);
    expect(next.low).toBeCloseTo(0.3);
    expect(next.high).toBeCloseTo(0.6);
  });

  it("does not clamp likely inside a fixed low/high wall - it can move past the old high", () => {
    const range = { low: 0.2, likely: 0.3, high: 0.4 };
    const next = shiftRange(range, 0.8);
    expect(next.likely).toBeCloseTo(0.8);
    expect(next.low).toBeCloseTo(0.7);
    expect(next.high).toBeCloseTo(0.9);
  });

  it("clamps the band at 0 without changing its width", () => {
    const range = { low: 0.2, likely: 0.3, high: 0.4 };
    const next = shiftRange(range, -0.5);
    const width = range.high - range.low;
    expect(next.low).toBeCloseTo(0);
    expect(next.high - next.low).toBeCloseTo(width);
    expect(next.high).toBeCloseTo(width);
  });

  it("clamps the band at 1 without changing its width", () => {
    const range = { low: 0.6, likely: 0.7, high: 0.8 };
    const next = shiftRange(range, 1.5);
    const width = range.high - range.low;
    expect(next.high).toBeCloseTo(1);
    expect(next.high - next.low).toBeCloseTo(width);
    expect(next.low).toBeCloseTo(1 - width);
  });

  it("stops at the edge rather than squashing when dragged far past it", () => {
    const range = { low: 0, likely: 0.05, high: 0.1 };
    const a = shiftRange(range, -1);
    const b = shiftRange(range, -5);
    // Close, not exact equality: both runs pin the band to the same edge, but
    // arrive there through a different arithmetic path (a smaller vs a much
    // larger delta before the clamp), which floating point does not promise
    // to land on the identical bit pattern for.
    expect(a.low).toBeCloseTo(b.low);
    expect(a.likely).toBeCloseTo(b.likely);
    expect(a.high).toBeCloseTo(b.high);
    expect(a.high - a.low).toBeCloseTo(0.1);
  });

  it("is a pure function: it does not mutate the range it was handed", () => {
    const range = { low: 0.2, likely: 0.3, high: 0.4 };
    const copy = { ...range };
    shiftRange(range, 0.9);
    expect(range).toEqual(copy);
  });
});

describe("likelyForKey", () => {
  it("steps right on ArrowRight and ArrowUp", () => {
    expect(likelyForKey("ArrowRight", 0.5)).toBeCloseTo(0.51);
    expect(likelyForKey("ArrowUp", 0.5)).toBeCloseTo(0.51);
  });

  it("steps left on ArrowLeft and ArrowDown", () => {
    expect(likelyForKey("ArrowLeft", 0.5)).toBeCloseTo(0.49);
    expect(likelyForKey("ArrowDown", 0.5)).toBeCloseTo(0.49);
  });

  it("Home and End go to the extremes", () => {
    expect(likelyForKey("Home", 0.5)).toBe(0);
    expect(likelyForKey("End", 0.5)).toBe(1);
  });

  it("clamps a step at the edges", () => {
    expect(likelyForKey("ArrowLeft", 0)).toBe(0);
    expect(likelyForKey("ArrowRight", 1)).toBe(1);
  });

  it("returns null for a key it does not handle", () => {
    expect(likelyForKey("Tab", 0.5)).toBeNull();
    expect(likelyForKey("a", 0.5)).toBeNull();
  });
});
