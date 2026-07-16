import { describe, it, expect } from "vitest";
import { fmtVol, pct, probColor, daysTo } from "./format";

describe("formatters", () => {
  it("fmtVol compacts", () => {
    expect(fmtVol(1_200_000)).toBe("1.2M");
    expect(fmtVol(34_000)).toBe("34k");
    expect(fmtVol(950)).toBe("950");
    expect(fmtVol(0)).toBe("—");
    expect(fmtVol(null)).toBe("—");
  });
  it("pct", () => { expect(pct(0.4)).toBe("40.0%"); expect(pct(null)).toBe("—"); expect(pct(0.4, 0)).toBe("40%"); });
  it("probColor bands", () => {
    expect(probColor(null)).toBe("#888888");
    expect(probColor(0.1)).toBe("#22c55e");
    expect(probColor(0.3)).toBe("#eab308");
    expect(probColor(0.6)).toBe("#f97316");
    expect(probColor(0.9)).toBe("#ef4444");
  });
  it("daysTo handles bad input", () => expect(daysTo("not-a-date")).toBeNull());
});
