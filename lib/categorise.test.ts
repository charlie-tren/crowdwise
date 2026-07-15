import { describe, it, expect } from "vitest";
import { categoriseMarket, isMacroRelevant } from "./categorise";

describe("categoriseMarket", () => {
  it("fed by title", () => expect(categoriseMarket("Will the Fed cut rates in March?")).toBe("Rates/Fed"));
  it("fomc by title", () => expect(categoriseMarket("FOMC holds at next meeting")).toBe("Rates/Fed"));
  it("inflation by title", () => expect(categoriseMarket("Will CPI come in above 3%?")).toBe("Inflation"));
  it("recession by title", () => expect(categoriseMarket("US recession declared in 2026?")).toBe("Growth/Recession"));
  it("oil by title", () => expect(categoriseMarket("WTI crude above $100 a barrel?")).toBe("Commodities/Oil"));
  it("geopolitics by title", () => expect(categoriseMarket("Russia-Ukraine ceasefire before July?")).toBe("Geopolitics"));
  it("politics by title", () => expect(categoriseMarket("Who wins the 2026 Senate election?")).toBe("Elections/Politics"));
  it("sports is Other", () => expect(categoriseMarket("Will the Lakers beat the Celtics tonight?")).toBe("Other"));
  it("entertainment is Other", () => expect(categoriseMarket("Top grossing film of the summer?")).toBe("Other"));
  it("curated series wins", () => expect(categoriseMarket("anything at all", "KXFED")).toBe("Rates/Fed"));
  it("series prefix fallback", () => expect(categoriseMarket("Nov print", "KXCPIYOY-26NOV")).toBe("Inflation"));
  it("rates beats politics ordering", () =>
    expect(categoriseMarket("Fed rate decision after the president speaks")).toBe("Rates/Fed"));
  it("Federer does not match fed", () => expect(categoriseMarket("Will Federer win the match?")).toBe("Other"));
  it("tennis name does not match iran", () =>
    expect(categoriseMarket("yes Thiago Agustin Tirante,yes Iryna Shymanovich")).toBe("Other"));
  it("Goldman does not match gold", () => expect(categoriseMarket("Will the Goldman Sachs CEO leave?")).toBe("Other"));
  it("empty inputs", () => {
    expect(categoriseMarket("")).toBe("Other");
    expect(categoriseMarket("", "")).toBe("Other");
  });
});

describe("isMacroRelevant", () => {
  it("macro true", () => expect(isMacroRelevant({ category: "Rates/Fed" })).toBe(true));
  it("other false", () => expect(isMacroRelevant({ category: "Other" })).toBe(false));
  it("missing category false", () => expect(isMacroRelevant({})).toBe(false));
});
