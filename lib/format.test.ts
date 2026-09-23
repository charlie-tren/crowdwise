import { describe, it, expect } from "vitest";
import { fmtVol, pct, pctScenario, probFill, daysTo } from "./format";

describe("formatters", () => {
  it("fmtVol compacts", () => {
    expect(fmtVol(1_200_000)).toBe("1.2M");
    expect(fmtVol(34_000)).toBe("34k");
    expect(fmtVol(950)).toBe("950");
    expect(fmtVol(0)).toBe("—");
    expect(fmtVol(null)).toBe("—");
  });
  it("pct", () => { expect(pct(0.4)).toBe("40.0%"); expect(pct(null)).toBe("—"); expect(pct(0.4, 0)).toBe("40%"); });
  it("probFill ramp", () => {
    expect(probFill(null)).toBe("#3a4256");
    expect(probFill(0)).toBe("rgb(51, 65, 90)");
    expect(probFill(1)).toBe("rgb(124, 196, 255)");
    expect(probFill(0.5)).toBe("rgb(76, 139, 208)");
  });
  it("daysTo handles bad input", () => expect(daysTo("not-a-date")).toBeNull());

  // Scenario Map only. pct() itself is untouched here: BoardTable,
  // MarketTreemap, CrossVenueView, HeadlineOdds and ProbBadge all keep
  // whole-percent rounding, unchanged.
  describe("pctScenario", () => {
    it("never rounds a non-zero probability down to 0%", () => {
      // 0.09 * 0.05, the Recession-in-2026 combined leg.
      expect(pctScenario(0.0045)).not.toBe("0%");
    });
    it("never rounds a sub-certain probability up to 100%", () => {
      expect(pctScenario(0.996)).not.toBe("100%");
    });
    it("still renders a genuine zero as 0%", () => {
      expect(pctScenario(0)).toBe("0%");
    });
    it("still renders a genuine one as 100%", () => {
      expect(pctScenario(1)).toBe("100%");
    });
    it("keeps an ordinary mid-range value whole, no decimal", () => {
      expect(pctScenario(0.38)).toBe("38%");
    });
    it("passes a null through the same as pct, without a fresh literal", () => {
      expect(pctScenario(null)).toBe(pct(null));
    });
  });
});
