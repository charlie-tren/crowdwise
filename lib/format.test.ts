import { describe, it, expect } from "vitest";
import { fmtVol, pct, probFill, daysTo } from "./format";

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
});
