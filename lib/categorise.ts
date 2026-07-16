import { CATEGORIES, KALSHI_MACRO_SERIES, SERIES_PREFIX, THEME_KEYWORDS, type Category } from "./taxonomy";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precompiled word-boundary pattern per theme (mirrors Python _THEME_PATTERNS).
const THEME_PATTERNS: [(typeof CATEGORIES)[number], RegExp][] = THEME_KEYWORDS.map(
  ([theme, kws]) => [theme, new RegExp(`\\b(?:${kws.map(escapeRegExp).join("|")})\\b`, "i")],
);

export function categoriseMarket(title: string, seriesTicker = ""): Category {
  const st = (seriesTicker || "").trim().toUpperCase();
  if (st) {
    if (st in KALSHI_MACRO_SERIES) return KALSHI_MACRO_SERIES[st];
    for (const [theme, prefixes] of SERIES_PREFIX) {
      if (prefixes.some((p) => st === p || st.startsWith(p))) return theme;
    }
  }
  const text = title || "";
  for (const [theme, pattern] of THEME_PATTERNS) {
    if (pattern.test(text)) return theme;
  }
  return "Other";
}

export function isMacroRelevant(record: { category?: string }): boolean {
  return (record.category ?? "Other") !== "Other";
}
