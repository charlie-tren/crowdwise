import { describe, it, expect } from "vitest";
import { CATEGORIES, KALSHI_MACRO_SERIES } from "./taxonomy";

describe("taxonomy", () => {
  it("every curated series maps to a real category", () => {
    for (const [series, theme] of Object.entries(KALSHI_MACRO_SERIES)) {
      expect(CATEGORIES).toContain(theme);
    }
  });
  it("allowlist is non-empty (>=10)", () => {
    expect(Object.keys(KALSHI_MACRO_SERIES).length).toBeGreaterThanOrEqual(10);
  });
});
