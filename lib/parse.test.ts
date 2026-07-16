import { describe, it, expect } from "vitest";
import { toFloat, isoDate, clampProb, firstOutcomePrice, kalshiProb, stripMarkdown } from "./parse";

describe("parse helpers", () => {
  it("stripMarkdown removes bold markers", () => {
    expect(stripMarkdown("Will **real GDP** increase?")).toBe("Will real GDP increase?");
    expect(stripMarkdown("__jobs__ report")).toBe("jobs report");
    expect(stripMarkdown("plain title")).toBe("plain title");
  });
  it("toFloat ok", () => { expect(toFloat("12.5")).toBe(12.5); expect(toFloat(7)).toBe(7); });
  it("toFloat junk -> default", () => {
    expect(toFloat(null)).toBe(0); expect(toFloat("")).toBe(0); expect(toFloat("abc", -1)).toBe(-1);
  });
  it("isoDate truncates", () => expect(isoDate("2026-03-18T20:00:00Z")).toBe("2026-03-18"));
  it("isoDate empty", () => { expect(isoDate(null)).toBe(""); expect(isoDate("")).toBe(""); });
  it("clampProb", () => {
    expect(clampProb(1.4)).toBe(1); expect(clampProb(-0.2)).toBe(0);
    expect(clampProb(0.5)).toBe(0.5); expect(clampProb(null)).toBeNull();
  });
  it("firstOutcomePrice json string", () => expect(firstOutcomePrice('["0.55", "0.45"]')).toBeCloseTo(0.55));
  it("firstOutcomePrice list", () => expect(firstOutcomePrice([0.3, 0.7])).toBeCloseTo(0.3));
  it("firstOutcomePrice bad", () => {
    expect(firstOutcomePrice(null)).toBeNull();
    expect(firstOutcomePrice("not json")).toBeNull();
    expect(firstOutcomePrice([])).toBeNull();
  });
  it("kalshiProb uses last price", () => expect(kalshiProb({ last_price_dollars: "0.47" })).toBeCloseTo(0.47));
  it("kalshiProb midpoint fallback", () =>
    expect(kalshiProb({ last_price_dollars: "0.0000", yes_bid_dollars: "0.40", yes_ask_dollars: "0.50" })).toBeCloseTo(0.45));
  it("kalshiProb none when no market", () => expect(kalshiProb({ last_price_dollars: "0.0000" })).toBeNull());
});
