# Macro Signals Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, public, responsive website that displays live Kalshi + Polymarket macro prediction-market probabilities, ported from the Vantage "Macro Signals" Streamlit module.

**Architecture:** Next.js (App Router) + TypeScript on Vercel. A Vercel Cron job fetches + normalises both platforms every ~10 min and writes a cached board to Vercel KV; all page traffic reads the cache (upstream APIs see one fetch per interval regardless of traffic). Per-market history is fetched on demand from Kalshi candlesticks via a cached route handler. The Python data layer (`Vantage/core/macro_signals_data.py`) is ported 1:1 to a pure, fixture-tested TypeScript `lib/` layer.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Recharts, `@vercel/kv`, Vitest.

**Reference source (read-only, do not modify):** `../Vantage/core/macro_signals_data.py`, `../Vantage/pages/7_Macro_Signals.py`, `../Vantage/tests/test_macro_signals_data.py`. The spec lives at `docs/specs/2026-07-15-macro-signals-website-design.md`.

**Path note:** All paths below are relative to the repo root `macro-signals-web/`. Commands assume that as CWD.

---

## File structure (locked before tasks)

```
macro-signals-web/
  lib/
    taxonomy.ts        # CATEGORIES, KALSHI_MACRO_SERIES, keyword/prefix rules
    categorise.ts      # categoriseMarket, isMacroRelevant
    parse.ts           # toFloat, isoDate, clampProb, firstOutcomePrice, kalshiProb, candleProb
    types.ts           # Market, Category, Snapshot, HistoryPoint, BoardPayload
    normalise.ts       # normaliseKalshiMarket, normalisePolymarketMarket
    sources.ts         # httpGetJson seam + fetchKalshi*/fetchPolymarket*/fetchKalshiMarketHistory
    board.ts           # fetchTopMarkets, groupByCategory, representativeByEvent
    history.ts         # computeMoves, historyMove (+ topMovers/themeConviction for v2)
    scenario.ts        # jointYes, atLeastOne
    format.ts          # fmtVol, daysTo, pct, probColor
    kv.ts              # readBoard, writeBoard, appendSnapshot, readSnapshots
  app/
    layout.tsx         # root layout, theme, fonts
    globals.css        # Tailwind + CSS vars
    page.tsx           # Board (home)
    market/[id]/page.tsx      # Market detail
    scenario/page.tsx         # Scenario Builder
    timeline/page.tsx         # Timeline
    about/page.tsx            # About / methodology
    api/
      cron/refresh/route.ts   # scheduled ingest -> KV
      board/route.ts          # read cached board
      history/[series]/[ticker]/route.ts  # Kalshi candlesticks proxy (cached)
  components/
    MarketCard.tsx
    BoardFilters.tsx
    BoardTable.tsx
    ProbBadge.tsx
    ThemeChip.tsx
    charts/ProbTimeline.tsx
    charts/TimelineBubble.tsx
    charts/LegBars.tsx
  test/
    fixtures/kalshi.json
    fixtures/polymarket.json
    fixtures/candlesticks.json
  vercel.json          # cron schedule
  .env.local.example
```

**Colours (Tailwind CSS vars, from spec):** bg `#0e1117`, panel `#262730`, text `#fafafa`, muted `#888888`, accent `#4c9be8`, green `#22c55e`, yellow `#eab308`, orange `#f97316`, red `#ef4444`.

---

## Task 0: Scaffold project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Scaffold Next.js + Tailwind**

Run (non-interactive, in the repo root; it creates files in place):
```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm
```
If it refuses because the directory is non-empty (the `docs/` + `.git` already exist), scaffold in a temp dir and copy in:
```bash
npx create-next-app@latest .cna-tmp --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm \
  && cp -r .cna-tmp/. . && rm -rf .cna-tmp
```

- [ ] **Step 2: Add test + data deps**

Run:
```bash
npm install recharts @vercel/kv
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx", "test/**/*.test.ts"],
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

Add scripts to `package.json` (`"test": "vitest run"`, `"test:watch": "vitest"`).

- [ ] **Step 4: Verify the toolchain runs**

Run: `npm run test -- --passWithNoTests`
Expected: exits 0 (no tests yet).
Run: `npm run build`
Expected: a clean Next.js production build.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + Tailwind + Vitest"
```

---

## Task 1: Taxonomy (categories, curated series, keyword rules)

Port `CATEGORIES`, `KALSHI_MACRO_SERIES`, `_SERIES_PREFIX`, `_THEME_KEYWORDS` verbatim.

**Files:**
- Create: `lib/taxonomy.ts`
- Test: `lib/taxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/taxonomy.test.ts`
Expected: FAIL - cannot resolve `./taxonomy`.

- [ ] **Step 3: Write the implementation**

Create `lib/taxonomy.ts` (values copied exactly from `macro_signals_data.py` lines 89-180):
```ts
export const CATEGORIES = [
  "Rates/Fed", "Inflation", "Growth/Recession",
  "Commodities/Oil", "Geopolitics", "Elections/Politics",
] as const;

export type Category = (typeof CATEGORIES)[number] | "Other";

export const KALSHI_MACRO_SERIES: Record<string, (typeof CATEGORIES)[number]> = {
  KXFED: "Rates/Fed", KXFEDDECISION: "Rates/Fed", KXRATECUT: "Rates/Fed",
  KXFEDMEET: "Rates/Fed", KXCBRATEHIKE: "Rates/Fed", KXUST10: "Rates/Fed",
  KX10Y2Y: "Rates/Fed", KX3MTBILL: "Rates/Fed",
  KXCPIYOY: "Inflation",
  KXNBERRECESSQ: "Growth/Recession", KXGDP: "Growth/Recession", KXU3: "Growth/Recession",
  KXISMPMI: "Growth/Recession", KXPAYROLLS: "Growth/Recession", KXCHGDPYOY: "Growth/Recession",
  KXEFFTARIFF: "Growth/Recession",
  KXWTI: "Commodities/Oil", KXBARRELS: "Commodities/Oil",
};

// [theme, prefixes] - series-ticker prefix fallback (checked before title keywords)
export const SERIES_PREFIX: [(typeof CATEGORIES)[number], string[]][] = [
  ["Rates/Fed", ["KXFED", "FED", "FOMC", "KXRATE", "KXUST", "KX10Y", "KX3M"]],
  ["Inflation", ["KXCPI", "CPI", "KXPCE", "PCE", "KXINFL"]],
  ["Growth/Recession", ["KXGDP", "GDP", "KXNBER", "WRECSS", "KXU3", "KXPAYROLL", "KXISM", "KXNFP"]],
  ["Commodities/Oil", ["KXWTI", "KXOIL", "KXBRENT", "KXBARREL", "KXOPEC", "KXGOLD"]],
];

// [theme, keywords] - matched as word-boundary regex, first match wins.
export const THEME_KEYWORDS: [(typeof CATEGORIES)[number], string[]][] = [
  ["Rates/Fed", ["fed", "fomc", "powell", "interest rate", "interest rates", "rate cut",
    "rate cuts", "rate hike", "rate hikes", "rate decision", "federal funds",
    "basis point", "basis points", "bps", "treasury yield", "treasury spread",
    "yield curve", "rate by"]],
  ["Inflation", ["inflation", "disinflation", "deflation", "cpi", "pce", "core pce", "price index"]],
  ["Growth/Recession", ["recession", "gdp", "unemployment", "jobs report", "nonfarm", "non-farm",
    "payroll", "payrolls", "jobless", "economic growth", "soft landing", "hard landing",
    "pmi", "tariff", "tariffs"]],
  ["Commodities/Oil", ["oil", "crude", "wti", "brent", "opec", "gasoline", "natural gas",
    "gold", "silver", "barrel", "barrels"]],
  ["Geopolitics", ["war", "invade", "invasion", "ceasefire", "nuclear", "military", "russia",
    "ukraine", "taiwan", "iran", "israel", "gaza", "nato", "sanctions", "missile",
    "north korea", "venezuela", "hamas", "hezbollah"]],
  ["Elections/Politics", ["election", "elections", "president", "presidential", "senate",
    "congress", "congressional", "governor", "primary", "nominee", "impeach", "impeachment",
    "shutdown", "supreme court", "prime minister", "parliament", "cabinet", "speaker",
    "referendum", "chancellor", "midterm", "midterms"]],
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/taxonomy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/taxonomy.ts lib/taxonomy.test.ts && git commit -m "feat: port macro taxonomy (categories, curated series, keyword rules)"
```

---

## Task 2: Categorisation (word-boundary regex)

Port `categorise_market` + `is_macro_relevant`. The word-boundary behaviour is load-bearing (stops "Federer"->fed, "Tirante"->iran, "Goldman"->gold).

**Files:**
- Create: `lib/categorise.ts`
- Test: `lib/categorise.test.ts`

- [ ] **Step 1: Write the failing test** (ported from `test_macro_signals_data.py::TestCategoriseMarket` + `TestIsMacroRelevant`)

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/categorise.test.ts`
Expected: FAIL - cannot resolve `./categorise`.

- [ ] **Step 3: Write the implementation**

Create `lib/categorise.ts`:
```ts
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
```

Note: JS `RegExp.prototype.test` with a non-global regex has no `lastIndex` statefulness, so reusing the compiled patterns across calls is safe (do NOT add the `g` flag).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/categorise.test.ts`
Expected: PASS (all cases, including the three proper-noun regressions).

- [ ] **Step 5: Commit**

```bash
git add lib/categorise.ts lib/categorise.test.ts && git commit -m "feat: port market categorisation with word-boundary matching"
```

---

## Task 3: Types + parsing helpers + normalisers

Port `_to_float`, `_iso_date`, `_clamp_prob`, `_first_outcome_price`, `_kalshi_prob`, `_candle_prob`, `normalise_kalshi_market`, `normalise_polymarket_market`, and define the `Market` type.

**Files:**
- Create: `lib/types.ts`, `lib/parse.ts`, `lib/normalise.ts`
- Test: `lib/parse.test.ts`, `lib/normalise.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/parse.test.ts` (ported from `TestHelpers`):
```ts
import { describe, it, expect } from "vitest";
import { toFloat, isoDate, clampProb, firstOutcomePrice, kalshiProb } from "./parse";

describe("parse helpers", () => {
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
```

Create `lib/normalise.test.ts` (ported from `TestNormaliseKalshi` + `TestNormalisePolymarket`):
```ts
import { describe, it, expect } from "vitest";
import { normaliseKalshiMarket, normalisePolymarketMarket } from "./normalise";

const kalshiRaw = (over: Record<string, unknown> = {}) => ({
  ticker: "KXFED-26MAR-C5.00", event_ticker: "KXFED-26MAR",
  title: "Will the Fed cut rates in March?", status: "active",
  close_time: "2026-03-18T20:00:00Z", volume_fp: "12345.6", last_price_dollars: "0.4700", ...over,
});

describe("normaliseKalshiMarket", () => {
  it("full record", () => {
    const r = normaliseKalshiMarket(kalshiRaw(), "Rates/Fed");
    expect(r.id).toBe("KXFED-26MAR-C5.00");
    expect(r.platform).toBe("Kalshi");
    expect(r.category).toBe("Rates/Fed");
    expect(r.prob).toBeCloseTo(0.47);
    expect(r.volume).toBeCloseTo(12345.6);
    expect(r.endDate).toBe("2026-03-18");
    expect(r.status).toBe("active");
    expect(r.series).toBe("KXFED");
    expect(r.event).toBe("KXFED-26MAR");
  });
  it("category override wins", () =>
    expect(normaliseKalshiMarket(kalshiRaw({ title: "ambiguous" }), "Inflation").category).toBe("Inflation"));
  it("category inferred when not given", () =>
    expect(normaliseKalshiMarket(kalshiRaw()).category).toBe("Rates/Fed"));
  it("price clamped", () =>
    expect(normaliseKalshiMarket(kalshiRaw({ last_price_dollars: "1.40" })).prob).toBe(1));
  it("missing price is null", () => {
    const raw = kalshiRaw(); delete (raw as Record<string, unknown>).last_price_dollars;
    expect(normaliseKalshiMarket(raw).prob).toBeNull();
  });
  it("missing fields don't crash", () => {
    const r = normaliseKalshiMarket({ ticker: "KXFED-X" });
    expect(r.volume).toBe(0); expect(r.endDate).toBe(""); expect(r.prob).toBeNull();
  });
});

const polyRaw = (over: Record<string, unknown> = {}) => ({
  conditionId: "0xabc123", question: "Will there be a US recession in 2026?",
  outcomePrices: '["0.32", "0.68"]', volumeNum: 98765.4,
  endDate: "2026-12-31T00:00:00Z", active: true, closed: false, ...over,
});

describe("normalisePolymarketMarket", () => {
  it("full record", () => {
    const r = normalisePolymarketMarket(polyRaw());
    expect(r.id).toBe("0xabc123");
    expect(r.platform).toBe("Polymarket");
    expect(r.category).toBe("Growth/Recession");
    expect(r.prob).toBeCloseTo(0.32);
    expect(r.volume).toBeCloseTo(98765.4);
    expect(r.endDate).toBe("2026-12-31");
    expect(r.status).toBe("active");
    expect(r.series).toBe("");
  });
  it("closed status", () =>
    expect(normalisePolymarketMarket(polyRaw({ active: false, closed: true })).status).toBe("closed"));
  it("volume string fallback", () => {
    const raw = polyRaw(); delete (raw as Record<string, unknown>).volumeNum;
    (raw as Record<string, unknown>).volume = "555.5";
    expect(normalisePolymarketMarket(raw).volume).toBeCloseTo(555.5);
  });
  it("id falls back to slug", () => {
    const raw = polyRaw(); delete (raw as Record<string, unknown>).conditionId;
    (raw as Record<string, unknown>).slug = "us-recession-2026";
    expect(normalisePolymarketMarket(raw).id).toBe("us-recession-2026");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/parse.test.ts lib/normalise.test.ts`
Expected: FAIL - modules not found.

- [ ] **Step 3: Write the implementations**

Create `lib/types.ts`:
```ts
import type { Category } from "./taxonomy";

export interface Market {
  id: string;
  platform: "Kalshi" | "Polymarket";
  title: string;
  category: Category;
  prob: number | null;
  volume: number;
  endDate: string;
  status: string;
  series: string;
  event: string;
}

export type HistoryPoint = [string, number]; // [isoTs, prob]

export interface Snapshot { ts: string; probs: Record<string, number>; }

export interface BoardPayload {
  markets: Market[];
  moves: Record<string, number>;
  fetchedAt: string;
}
```

Create `lib/parse.ts` (port of Python parsing helpers, lines 225-284 + `_candle_prob` 694-710):
```ts
export function toFloat(value: unknown, def = 0): number {
  if (value === null || value === undefined || value === "") return def;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : def;
}

export function isoDate(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function clampProb(p: number | null): number | null {
  if (p === null || p === undefined) return null;
  return Math.min(Math.max(p, 0), 1);
}

export function firstOutcomePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let val: unknown = raw;
  try {
    if (typeof val === "string") val = JSON.parse(val);
    if (Array.isArray(val) && val.length > 0) {
      const n = Number(val[0]);
      return Number.isFinite(n) ? clampProb(n) : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function kalshiProb(raw: Record<string, unknown>): number | null {
  const last = toFloat(raw.last_price_dollars, 0);
  if (last > 0) return clampProb(last);
  const bid = toFloat(raw.yes_bid_dollars, 0);
  const ask = toFloat(raw.yes_ask_dollars, 0);
  if (ask > 0) return clampProb((bid + ask) / 2);
  return null;
}

export function candleProb(candle: Record<string, any>): number | null {
  const price = candle.price ?? {};
  for (const key of ["close_dollars", "mean_dollars", "previous_dollars"]) {
    const raw = price[key];
    if (raw !== null && raw !== undefined) {
      const v = toFloat(raw, 0);
      if (v > 0) return clampProb(v);
    }
  }
  const bid = toFloat(candle.yes_bid?.close_dollars, 0);
  const ask = toFloat(candle.yes_ask?.close_dollars, 0);
  if (bid > 0 && ask > 0) return clampProb((bid + ask) / 2);
  return null;
}
```

Create `lib/normalise.ts` (port of lines 291-344):
```ts
import { categoriseMarket } from "./categorise";
import { toFloat, isoDate, kalshiProb, firstOutcomePrice } from "./parse";
import type { Category } from "./taxonomy";
import type { Market } from "./types";

export function normaliseKalshiMarket(raw: Record<string, any>, category?: Category): Market {
  const ticker = String(raw.ticker ?? "").trim();
  const series = ticker.includes("-") ? ticker.split("-", 1)[0] : ticker;
  const title = String(raw.title ?? raw.yes_sub_title ?? ticker).trim();
  return {
    id: ticker,
    platform: "Kalshi",
    title,
    category: category !== undefined ? category : categoriseMarket(title, series),
    prob: kalshiProb(raw),
    volume: toFloat(raw.volume_fp, 0),
    endDate: isoDate(raw.close_time ?? raw.expiration_time),
    status: String(raw.status ?? "").trim().toLowerCase(),
    series,
    event: String(raw.event_ticker ?? "").trim(),
  };
}

export function normalisePolymarketMarket(raw: Record<string, any>): Market {
  const mid = String(raw.conditionId ?? raw.id ?? raw.slug ?? "").trim();
  const title = String(raw.question ?? raw.title ?? mid).trim();
  const volume = raw.volumeNum ?? raw.volume;
  const status = raw.closed ? "closed" : raw.active ? "active" : "";
  return {
    id: mid,
    platform: "Polymarket",
    title,
    category: categoriseMarket(title, ""),
    prob: firstOutcomePrice(raw.outcomePrices),
    volume: toFloat(volume, 0),
    endDate: isoDate(raw.endDate ?? raw.end_date),
    status,
    series: "",
    event: "",
  };
}
```

Note the Python `ticker.split("-", 1)[0]` returns the whole string when there is no "-"; the TS guard (`includes("-") ? ...`) preserves that.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- lib/parse.test.ts lib/normalise.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/parse.ts lib/normalise.ts lib/parse.test.ts lib/normalise.test.ts && git commit -m "feat: port record types, parsing helpers, and normalisers"
```

---

## Task 4: Fetch seam + platform fetchers (fixture-mocked)

Port `_http_get_json`, `fetch_kalshi_series_markets`, `fetch_kalshi_markets`, `fetch_polymarket_markets`, `fetch_kalshi_market_history`. Preserve best-effort semantics (a failing series/platform is skipped, not fatal). The single seam is injectable so tests never hit the network (mirrors the Python monkeypatch pattern).

**Files:**
- Create: `lib/sources.ts`, `test/fixtures/kalshi.json`, `test/fixtures/polymarket.json`, `test/fixtures/candlesticks.json`
- Test: `lib/sources.test.ts`

- [ ] **Step 1: Write the failing test** (ported from `TestFetchKalshiMarkets`, `TestFetchPolymarketMarkets`, `TestKalshiMarketHistory`)

```ts
import { describe, it, expect } from "vitest";
import {
  fetchKalshiMarkets, fetchPolymarketMarkets, fetchKalshiMarketHistory, setHttpGetJson, resetHttpGetJson,
} from "./sources";

describe("fetchKalshiMarkets (mocked seam)", () => {
  it("iterates series and tags theme", async () => {
    setHttpGetJson(async (_url, params) => {
      const s = params!.series_ticker as string;
      return { markets: [{ ticker: `${s}-A`, title: "x", last_price_dollars: "0.5", volume_fp: "10", status: "active" }] };
    });
    const out = await fetchKalshiMarkets({ KXFED: "Rates/Fed", KXCPIYOY: "Inflation" });
    expect(out.length).toBe(2);
    const cats = Object.fromEntries(out.map((r) => [r.id, r.category]));
    expect(cats["KXFED-A"]).toBe("Rates/Fed");
    expect(cats["KXCPIYOY-A"]).toBe("Inflation");
    resetHttpGetJson();
  });

  it("one failing series is not fatal", async () => {
    setHttpGetJson(async (_url, params) => {
      if (params!.series_ticker === "BOOM") throw new Error("boom");
      return { markets: [{ ticker: "KXFED-A", last_price_dollars: "0.5", volume_fp: "10", status: "active" }] };
    });
    const out = await fetchKalshiMarkets({ BOOM: "Rates/Fed", KXFED: "Rates/Fed" });
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("KXFED-A");
    resetHttpGetJson();
  });

  it("empty response", async () => {
    setHttpGetJson(async () => ({ markets: [] }));
    expect(await fetchKalshiMarkets({ KXFED: "Rates/Fed" })).toEqual([]);
    resetHttpGetJson();
  });
});

describe("fetchPolymarketMarkets (mocked seam)", () => {
  it("bare list response", async () => {
    setHttpGetJson(async () => [
      { conditionId: "0x1", question: "US recession in 2026?", outcomePrices: '["0.3","0.7"]', volumeNum: 100, active: true },
      { conditionId: "0x2", question: "Lakers win tonight?", outcomePrices: '["0.5","0.5"]', volumeNum: 200, active: true },
    ]);
    const out = await fetchPolymarketMarkets();
    expect(out.length).toBe(2);
    expect(out[0].category).toBe("Growth/Recession");
    expect(out[1].category).toBe("Other");
    resetHttpGetJson();
  });

  it("wrapped data response", async () => {
    setHttpGetJson(async () => ({ data: [{ conditionId: "0x9", question: "CPI above 3%?", outcomePrices: '["0.4","0.6"]', active: true }] }));
    const out = await fetchPolymarketMarkets();
    expect(out.length).toBe(1);
    expect(out[0].category).toBe("Inflation");
    resetHttpGetJson();
  });
});

describe("fetchKalshiMarketHistory (mocked seam)", () => {
  const candles = () => ({ candlesticks: [
    { end_period_ts: 1735689600, price: { close_dollars: "0.40" } },
    { end_period_ts: 1735776000, price: { close_dollars: "0.55" } },
  ]});
  it("parses candles to iso/prob pairs oldest-first", async () => {
    setHttpGetJson(async () => candles());
    const out = await fetchKalshiMarketHistory("KXFED", "KXFED-X", { days: 30, nowTs: 1735800000 });
    expect(out.length).toBe(2);
    expect(out[0][1]).toBeCloseTo(0.40);
    expect(out[1][1]).toBeCloseTo(0.55);
    expect(out[0][0] < out[1][0]).toBe(true);
    resetHttpGetJson();
  });
  it("falls back to bid/ask midpoint", async () => {
    setHttpGetJson(async () => ({ candlesticks: [
      { end_period_ts: 1735689600, price: { close_dollars: "0.0000" }, yes_bid: { close_dollars: "0.30" }, yes_ask: { close_dollars: "0.50" } },
    ]}));
    const out = await fetchKalshiMarketHistory("KXFED", "KXFED-X", { nowTs: 1735800000 });
    expect(out[0][1]).toBeCloseTo(0.40);
    resetHttpGetJson();
  });
  it("empty on missing tickers", async () => {
    expect(await fetchKalshiMarketHistory("", "X")).toEqual([]);
    expect(await fetchKalshiMarketHistory("KXFED", "")).toEqual([]);
  });
  it("empty on fetch returning null", async () => {
    setHttpGetJson(async () => null);
    expect(await fetchKalshiMarketHistory("KXFED", "KXFED-X", { nowTs: 1735800000 })).toEqual([]);
    resetHttpGetJson();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/sources.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/sources.ts` (ports lines 351-438 + 724-760; the seam is a swappable module-level function):
```ts
import { normaliseKalshiMarket, normalisePolymarketMarket } from "./normalise";
import { KALSHI_MACRO_SERIES } from "./taxonomy";
import { candleProb } from "./parse";
import type { Category } from "./taxonomy";
import type { Market, HistoryPoint } from "./types";

export const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
export const POLYMARKET_BASE = "https://gamma-api.polymarket.com";
export const DEFAULT_TIMEOUT = 10_000;

type HttpGetJson = (url: string, params?: Record<string, string | number>, timeoutMs?: number) => Promise<any>;

async function realHttpGetJson(url: string, params: Record<string, string | number> = {}, timeoutMs = DEFAULT_TIMEOUT): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const full = qs ? `${url}?${qs}` : url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(full, {
      headers: { Accept: "application/json", "User-Agent": "macro-signals-web/1.0" },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

let _httpGetJson: HttpGetJson = realHttpGetJson;
export function setHttpGetJson(fn: HttpGetJson) { _httpGetJson = fn; }
export function resetHttpGetJson() { _httpGetJson = realHttpGetJson; }

export async function fetchKalshiSeriesMarkets(
  seriesTicker: string, category?: Category, status = "open", limit = 200,
): Promise<Market[]> {
  const data = await _httpGetJson(`${KALSHI_BASE}/markets`, { series_ticker: seriesTicker, status, limit });
  const raw = data?.markets ?? [];
  return raw.map((m: Record<string, any>) => normaliseKalshiMarket(m, category));
}

export async function fetchKalshiMarkets(
  series: Record<string, Category> = KALSHI_MACRO_SERIES, status = "open",
): Promise<Market[]> {
  const out: Market[] = [];
  for (const [seriesTicker, theme] of Object.entries(series)) {
    try {
      out.push(...(await fetchKalshiSeriesMarkets(seriesTicker, theme, status)));
    } catch (err) {
      console.warn(`Kalshi series ${seriesTicker} fetch failed`, err);
    }
  }
  return out;
}

export async function fetchPolymarketMarkets(limit = 500): Promise<Market[]> {
  const data = await _httpGetJson(`${POLYMARKET_BASE}/markets`, {
    limit, active: "true", closed: "false", order: "volumeNum", ascending: "false",
  });
  let items: any[];
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === "object") items = data.data ?? data.markets ?? [];
  else items = [];
  return items.map((m) => normalisePolymarketMarket(m));
}

export async function fetchKalshiMarketHistory(
  seriesTicker: string, marketTicker: string,
  opts: { days?: number; periodInterval?: number; nowTs?: number } = {},
): Promise<HistoryPoint[]> {
  if (!seriesTicker || !marketTicker) return [];
  const { days = 90, periodInterval = 1440, nowTs } = opts;
  const end = Math.floor(nowTs ?? Date.now() / 1000);
  const start = end - days * 24 * 3600;
  const url = `${KALSHI_BASE}/series/${seriesTicker}/markets/${marketTicker}/candlesticks`;
  let data: any;
  try {
    data = await _httpGetJson(url, { start_ts: start, end_ts: end, period_interval: periodInterval }, 8000);
  } catch {
    return [];
  }
  if (!data) return [];
  const out: HistoryPoint[] = [];
  for (const candle of data.candlesticks ?? []) {
    const ts = candle.end_period_ts;
    const prob = candleProb(candle);
    if (ts === null || ts === undefined || prob === null) continue;
    const iso = new Date(Number(ts) * 1000).toISOString();
    out.push([iso, prob]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}
```

Note: this task uses `Date.now()` inside `fetchKalshiMarketHistory` only as a default; tests always pass `nowTs`, so they are deterministic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/sources.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Capture real API fixtures for later UI/integration work (best-effort)**

Run (may fail offline / if Polymarket unreachable - that's fine, they are only used for local UI dev):
```bash
curl -s "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFED&status=open&limit=5" > test/fixtures/kalshi.json || echo '{"markets":[]}' > test/fixtures/kalshi.json
curl -s "https://gamma-api.polymarket.com/markets?limit=5&active=true&closed=false&order=volumeNum&ascending=false" > test/fixtures/polymarket.json || echo '[]' > test/fixtures/polymarket.json
echo '{"candlesticks":[]}' > test/fixtures/candlesticks.json
```

- [ ] **Step 6: Commit**

```bash
git add lib/sources.ts lib/sources.test.ts test/fixtures && git commit -m "feat: port platform fetchers with injectable HTTP seam"
```

---

## Task 5: Orchestrator + grouping + representative-by-event

Port `fetch_top_markets`, `group_by_category`, `representative_by_event`, plus the `_LIVE_STATUSES` filter.

**Files:**
- Create: `lib/board.ts`
- Test: `lib/board.test.ts`

- [ ] **Step 1: Write the failing test** (ported from `TestFetchTopMarkets`, `TestGroupByCategory`, `TestRepresentativeByEvent`)

```ts
import { describe, it, expect, afterEach } from "vitest";
import { fetchTopMarkets, groupByCategory, representativeByEvent } from "./board";
import * as sources from "./sources";
import { normaliseKalshiMarket, normalisePolymarketMarket } from "./normalise";

afterEach(() => sources.resetHttpGetJson());

describe("fetchTopMarkets", () => {
  it("filters, sorts, and combines (drops Other despite volume)", async () => {
    sources.setHttpGetJson(async (url, params) => {
      if (url.includes("elections.kalshi")) {
        return { markets: [{ ticker: "KXFED-A", title: "Fed cut?", last_price_dollars: "0.5", volume_fp: "30", status: "active" }] };
      }
      return [
        { conditionId: "0x1", question: "US recession in 2026?", outcomePrices: '["0.3","0.7"]', volumeNum: 100, active: true },
        { conditionId: "0x2", question: "Lakers win?", outcomePrices: '["0.5","0.5"]', volumeNum: 9999, active: true },
      ];
    });
    const out = await fetchTopMarkets();
    expect(out.map((r) => r.category)).not.toContain("Other");
    expect(out.map((r) => r.id)).toEqual(["0x1", "KXFED-A"]); // 100 > 30
  });

  it("polymarket failing is not fatal", async () => {
    sources.setHttpGetJson(async (url) => {
      if (url.includes("elections.kalshi")) {
        return { markets: [{ ticker: "KXFED-A", last_price_dollars: "0.5", volume_fp: "10", status: "active" }] };
      }
      throw new Error("network down");
    });
    const out = await fetchTopMarkets();
    expect(out.length).toBe(1);
    expect(out[0].category).toBe("Rates/Fed");
  });
});

describe("groupByCategory", () => {
  it("groups in category order and omits empty", () => {
    const records = [
      { category: "Elections/Politics", id: "p1" },
      { category: "Rates/Fed", id: "f1" },
      { category: "Rates/Fed", id: "f2" },
    ] as any;
    const grouped = groupByCategory(records);
    expect(Object.keys(grouped)).toEqual(["Rates/Fed", "Elections/Politics"]);
    expect(grouped["Rates/Fed"].map((r: any) => r.id)).toEqual(["f1", "f2"]);
    expect("Inflation" in grouped).toBe(false);
  });
  it("per-category cap", () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ category: "Rates/Fed", id: `f${i}` })) as any;
    expect(groupByCategory(records, 3)["Rates/Fed"].length).toBe(3);
  });
});

describe("representativeByEvent", () => {
  it("picks highest-volume per event", () => {
    const records = [
      { id: "a", event: "E1", volume: 10 }, { id: "b", event: "E1", volume: 99 }, { id: "c", event: "E2", volume: 5 },
    ] as any;
    expect(new Set(representativeByEvent(records).map((r) => r.id))).toEqual(new Set(["b", "c"]));
  });
  it("eventless records pass through", () => {
    const records = [
      { id: "p1", event: "", volume: 1 }, { id: "p2", event: "", volume: 2 },
      { id: "k1", event: "E1", volume: 3 }, { id: "k2", event: "E1", volume: 4 },
    ] as any;
    expect(new Set(representativeByEvent(records).map((r) => r.id))).toEqual(new Set(["p1", "p2", "k2"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/board.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/board.ts` (ports lines 441-545):
```ts
import { fetchKalshiMarkets, fetchPolymarketMarkets } from "./sources";
import { isMacroRelevant } from "./categorise";
import { CATEGORIES } from "./taxonomy";
import type { Market } from "./types";

const LIVE_STATUSES = new Set(["active", "open", ""]);

export async function fetchTopMarkets(includeKalshi = true, includePolymarket = true): Promise<Market[]> {
  const records: Market[] = [];
  if (includeKalshi) {
    try { records.push(...(await fetchKalshiMarkets())); }
    catch (err) { console.warn("Kalshi fetch failed", err); }
  }
  if (includePolymarket) {
    try { records.push(...(await fetchPolymarketMarkets())); }
    catch (err) { console.warn("Polymarket fetch failed", err); }
  }
  const liveMacro = records.filter((r) => isMacroRelevant(r) && LIVE_STATUSES.has(r.status));
  liveMacro.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return liveMacro;
}

export function groupByCategory(records: Market[], perCategory?: number): Record<string, Market[]> {
  const grouped: Record<string, Market[]> = {};
  for (const cat of CATEGORIES) {
    let members = records.filter((r) => r.category === cat);
    if (perCategory !== undefined) members = members.slice(0, perCategory);
    if (members.length) grouped[cat] = members;
  }
  return grouped;
}

export function representativeByEvent(records: Market[]): Market[] {
  const byEvent = new Map<string, Market>();
  const singles: Market[] = [];
  for (const r of records) {
    const ev = r.event || "";
    if (!ev) { singles.push(r); continue; }
    const cur = byEvent.get(ev);
    if (!cur || (r.volume || 0) > (cur.volume || 0)) byEvent.set(ev, r);
  }
  return [...byEvent.values(), ...singles];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/board.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/board.ts lib/board.test.ts && git commit -m "feat: port board orchestrator, grouping, representative-by-event"
```

---

## Task 6: Moves + history analytics + scenario math + formatters

Port `compute_moves`, `history_move` (both needed by v1), and the `top_movers`/`theme_conviction`/`market_prob_series` analytics (needed by v2 Market Map - port now, tested, so the port is complete and consistent). Plus the inline scenario math and the page formatters.

**Files:**
- Create: `lib/history.ts`, `lib/scenario.ts`, `lib/format.ts`
- Test: `lib/history.test.ts`, `lib/scenario.test.ts`, `lib/format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/history.test.ts` (ported from `TestBoardHistory::test_compute_moves*`, `TestTopMovers`, `TestThemeConviction`, `TestMarketProbSeries`, `TestHistoryMove`):
```ts
import { describe, it, expect } from "vitest";
import { computeMoves, historyMove, topMovers, themeConviction, marketProbSeries } from "./history";

describe("computeMoves", () => {
  it("delta vs latest snapshot; omits ids not in snapshot", () => {
    const history = [{ ts: "t0", probs: { a: 0.40, b: 0.50 } }];
    const records = [{ id: "a", prob: 0.55 }, { id: "b", prob: 0.50 }, { id: "c", prob: 0.10 }] as any;
    const moves = computeMoves(records, history);
    expect(moves.a).toBeCloseTo(0.15);
    expect(moves.b).toBeCloseTo(0.0);
    expect("c" in moves).toBe(false);
  });
  it("no history -> empty", () => expect(computeMoves([{ id: "a", prob: 0.5 }] as any, [])).toEqual({}));
});

describe("historyMove", () => {
  it("net move last - first", () =>
    expect(historyMove([["2026-06-01", 0.40], ["2026-06-02", 0.55], ["2026-06-03", 0.50]])).toBeCloseTo(0.10));
  it("negative move", () => expect(historyMove([["a", 0.6], ["b", 0.45]])).toBeCloseTo(-0.15));
  it("null when too few points", () => {
    expect(historyMove([["a", 0.5]])).toBeNull();
    expect(historyMove([])).toBeNull();
  });
});

const rec = (id: string, cat: string, prob: number | null, vol: number) =>
  ({ id, category: cat, prob, volume: vol, title: `market ${id}`, platform: "Kalshi" }) as any;

describe("topMovers", () => {
  it("sorts by absolute move and limits", () => {
    const recs = [rec("a", "Inflation", 0.5, 10), rec("b", "Rates/Fed", 0.5, 10), rec("c", "Geopolitics", 0.5, 10)];
    const out = topMovers(recs, { a: 0.02, b: -0.20, c: 0.05 }, 2);
    expect(out.map((r) => r.id)).toEqual(["b", "c"]);
    expect(out[0].move).toBe(-0.20);
  });
  it("skips records without a move", () =>
    expect(topMovers([rec("a", "Inflation", 0.5, 10), rec("b", "Rates/Fed", 0.5, 10)], { a: 0.1}, 10).map((r) => r.id)).toEqual(["a"]));
});

describe("themeConviction", () => {
  it("volume-weights the average", () => {
    const out = themeConviction([rec("a", "Inflation", 0.20, 1), rec("b", "Inflation", 0.80, 9)]);
    const infl = out.find((r) => r.category === "Inflation")!;
    expect(infl.weightedProb).toBeCloseTo(0.74);
    expect(infl.count).toBe(2);
  });
  it("zero volume -> simple mean", () => {
    const out = themeConviction([rec("a", "Rates/Fed", 0.40, 0), rec("b", "Rates/Fed", 0.60, 0)]);
    expect(out.find((r) => r.category === "Rates/Fed")!.weightedProb).toBeCloseTo(0.50);
  });
  it("category order, skips empty, ignores null prob", () => {
    const out = themeConviction([rec("a", "Geopolitics", 0.5, 1), rec("b", "Inflation", 0.5, 1), rec("c", "Inflation", null, 5)]);
    expect(out.map((r) => r.category)).toEqual(["Inflation", "Geopolitics"]);
    expect(out[0].count).toBe(1);
  });
});

describe("marketProbSeries", () => {
  it("builds per-id oldest-first with gaps", () => {
    const hist = [{ ts: "2026-06-01", probs: { a: 0.5, b: 0.3 } }, { ts: "2026-06-02", probs: { a: 0.6 } }];
    const out = marketProbSeries(hist);
    expect(out.a).toEqual([["2026-06-01", 0.5], ["2026-06-02", 0.6]]);
    expect(out.b).toEqual([["2026-06-01", 0.3]]);
  });
  it("filters to requested ids", () =>
    expect(Object.keys(marketProbSeries([{ ts: "d", probs: { a: 0.5, b: 0.3 } }], ["a"]))).toEqual(["a"]));
  it("empty history -> empty", () => expect(marketProbSeries([])).toEqual({}));
});
```

Create `lib/scenario.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { jointYes, atLeastOne } from "./scenario";

describe("scenario math", () => {
  it("joint = product of probabilities", () => expect(jointYes([0.5, 0.4])).toBeCloseTo(0.2));
  it("at-least-one = 1 - product(1-p)", () => expect(atLeastOne([0.5, 0.4])).toBeCloseTo(0.7));
  it("three legs", () => {
    expect(jointYes([0.5, 0.5, 0.5])).toBeCloseTo(0.125);
    expect(atLeastOne([0.5, 0.5, 0.5])).toBeCloseTo(0.875);
  });
});
```

Create `lib/format.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/history.test.ts lib/scenario.test.ts lib/format.test.ts`
Expected: FAIL - modules not found.

- [ ] **Step 3: Write the implementations**

Create `lib/history.ts` (ports `compute_moves` 595-614, `top_movers` 619-632, `theme_conviction` 635-664, `market_prob_series` 667-689, `history_move` 713-721):
```ts
import { CATEGORIES } from "./taxonomy";
import type { Market, Snapshot, HistoryPoint } from "./types";

export function computeMoves(records: Array<{ id: string; prob: number | null }>, history: Snapshot[]): Record<string, number> {
  if (!history.length) return {};
  const prev = history[history.length - 1].probs ?? {};
  const moves: Record<string, number> = {};
  for (const r of records) {
    if (r.id == null || r.prob == null) continue;
    const before = prev[r.id];
    if (before == null) continue;
    moves[r.id] = r.prob - before;
  }
  return moves;
}

export function historyMove(points: HistoryPoint[]): number | null {
  if (!points || points.length < 2) return null;
  return points[points.length - 1][1] - points[0][1];
}

export function topMovers(records: Market[], moves: Record<string, number>, n = 10): Array<Market & { move: number }> {
  const out = records.filter((r) => r.id in moves).map((r) => ({ ...r, move: moves[r.id] }));
  out.sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
  return out.slice(0, Math.max(0, n));
}

export interface ThemeConviction { category: string; weightedProb: number; count: number; volume: number; }

export function themeConviction(records: Market[]): ThemeConviction[] {
  const out: ThemeConviction[] = [];
  for (const cat of CATEGORIES) {
    const members = records.filter((r) => r.category === cat && r.prob != null);
    if (!members.length) continue;
    const vols = members.map((r) => Math.max(0, r.volume || 0));
    const totalVol = vols.reduce((a, b) => a + b, 0);
    const weighted = totalVol > 0
      ? members.reduce((acc, r, i) => acc + (r.prob as number) * vols[i], 0) / totalVol
      : members.reduce((acc, r) => acc + (r.prob as number), 0) / members.length;
    out.push({ category: cat, weightedProb: weighted, count: members.length, volume: totalVol });
  }
  return out;
}

export function marketProbSeries(history: Snapshot[], ids?: string[]): Record<string, HistoryPoint[]> {
  const want = ids ? new Set(ids) : null;
  const series: Record<string, HistoryPoint[]> = {};
  for (const snap of history) {
    const ts = snap.ts;
    if (!ts) continue;
    for (const [mid, p] of Object.entries(snap.probs ?? {})) {
      if (want && !want.has(mid)) continue;
      if (p == null) continue;
      (series[mid] ??= []).push([ts, p]);
    }
  }
  return series;
}
```

Create `lib/scenario.ts` (ports the inline math in `7_Macro_Signals.py` 670-676):
```ts
export function jointYes(probs: number[]): number {
  return probs.reduce((acc, p) => acc * p, 1);
}
export function atLeastOne(probs: number[]): number {
  return 1 - probs.reduce((acc, p) => acc * (1 - p), 1);
}
```

Create `lib/format.ts` (ports `_fmt_vol` 111-119, `_days_to` 122-127, `_pct` 130-133, `_prob_color` 136-145):
```ts
export function fmtVol(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return `${Math.round(v)}`;
}

export function daysTo(endDate: string): number | null {
  const d = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t0) / 86_400_000);
}

export function pct(p: number | null, decimals = 1): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(decimals)}%`;
}

export function probColor(p: number | null): string {
  if (p == null) return "#888888";
  if (p < 0.25) return "#22c55e";
  if (p < 0.50) return "#eab308";
  if (p < 0.75) return "#f97316";
  return "#ef4444";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- lib/history.test.ts lib/scenario.test.ts lib/format.test.ts`
Expected: PASS (all cases). Note `fmtVol` uses `Math.round` for the `k` band to match Python's `:.0f` (34000 -> "34k").

- [ ] **Step 5: Commit**

```bash
git add lib/history.ts lib/scenario.ts lib/format.ts lib/history.test.ts lib/scenario.test.ts lib/format.test.ts && git commit -m "feat: port moves/analytics, scenario math, and formatters"
```

---

## Task 7: KV cache layer

Wrap Vercel KV for the board cache + rolling snapshot history. Fixture-tested against an in-memory fake so tests need no live KV.

**Files:**
- Create: `lib/kv.ts`
- Test: `lib/kv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeKvStore } from "./kv";
import type { Market } from "./types";

function fakeKv() {
  const m = new Map<string, unknown>();
  return {
    store: m,
    async get<T>(k: string) { return (m.get(k) as T) ?? null; },
    async set(k: string, v: unknown) { m.set(k, v); },
  };
}

const mkt = (id: string, prob: number): Market => ({
  id, platform: "Kalshi", title: id, category: "Rates/Fed", prob, volume: 1,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

describe("kv store", () => {
  let kv: ReturnType<typeof fakeKv>;
  let store: ReturnType<typeof makeKvStore>;
  beforeEach(() => { kv = fakeKv(); store = makeKvStore(kv, { maxSnapshots: 3 }); });

  it("writeBoard then readBoard roundtrips with moves vs prior snapshot", async () => {
    await store.appendSnapshot({ ts: "t0", probs: { a: 0.40 } });
    await store.writeBoard([mkt("a", 0.55)], "2026-07-15T10:00:00");
    const payload = await store.readBoard();
    expect(payload?.markets.length).toBe(1);
    expect(payload?.moves.a).toBeCloseTo(0.15);
    expect(payload?.fetchedAt).toBe("2026-07-15T10:00:00");
  });

  it("readBoard returns null when nothing cached", async () => {
    expect(await store.readBoard()).toBeNull();
  });

  it("appendSnapshot trims to maxSnapshots", async () => {
    for (let i = 0; i < 6; i++) await store.appendSnapshot({ ts: `t${i}`, probs: { a: i / 10 } });
    const snaps = await store.readSnapshots();
    expect(snaps.length).toBe(3);
    expect(snaps.map((s) => s.ts)).toEqual(["t3", "t4", "t5"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/kv.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/kv.ts`:
```ts
import { computeMoves } from "./history";
import type { Market, Snapshot, BoardPayload } from "./types";

export interface KvLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
}

const BOARD_KEY = "board:current";
const SNAP_KEY = "board:snapshots";

export function makeKvStore(kv: KvLike, opts: { maxSnapshots?: number } = {}) {
  const maxSnapshots = opts.maxSnapshots ?? 200;

  async function readSnapshots(): Promise<Snapshot[]> {
    return (await kv.get<Snapshot[]>(SNAP_KEY)) ?? [];
  }

  async function appendSnapshot(snap: Snapshot): Promise<void> {
    const snaps = await readSnapshots();
    snaps.push(snap);
    await kv.set(SNAP_KEY, snaps.slice(-maxSnapshots));
  }

  // Compute moves vs the latest snapshot, store the board, THEN append this
  // board as the new snapshot (matches the Streamlit order: delta first, save
  // after — see 7_Macro_Signals.py::_ensure_board).
  async function writeBoard(markets: Market[], fetchedAt: string): Promise<void> {
    const priorSnaps = await readSnapshots();
    const moves = computeMoves(markets, priorSnaps);
    const payload: BoardPayload = { markets, moves, fetchedAt };
    await kv.set(BOARD_KEY, payload);
    const probs: Record<string, number> = {};
    for (const m of markets) if (m.id && m.prob != null) probs[m.id] = m.prob;
    if (Object.keys(probs).length) await appendSnapshot({ ts: fetchedAt, probs });
  }

  async function readBoard(): Promise<BoardPayload | null> {
    return await kv.get<BoardPayload>(BOARD_KEY);
  }

  return { readSnapshots, appendSnapshot, writeBoard, readBoard };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/kv.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/kv.ts lib/kv.test.ts && git commit -m "feat: KV cache store for board + rolling snapshots"
```

---

## Task 8: API routes (cron refresh, board read, history proxy)

**Files:**
- Create: `app/api/cron/refresh/route.ts`, `app/api/board/route.ts`, `app/api/history/[series]/[ticker]/route.ts`, `lib/kvClient.ts`
- Test: `app/api/board/route.test.ts`

- [ ] **Step 1: Write the failing test (board route contract)**

Create `app/api/board/route.test.ts` — this asserts the route returns the cached payload shape. It stubs the KV client module.
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/kvClient", () => ({
  boardStore: {
    readBoard: async () => ({ markets: [{ id: "a", platform: "Kalshi", title: "t", category: "Rates/Fed", prob: 0.5, volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "" }], moves: { a: 0.1 }, fetchedAt: "2026-07-15T10:00:00" }),
  },
}));

import { GET } from "./route";

describe("GET /api/board", () => {
  it("returns the cached board payload", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.markets.length).toBe(1);
    expect(body.moves.a).toBeCloseTo(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/api/board/route.test.ts`
Expected: FAIL - `./route` not found.

- [ ] **Step 3: Write the KV client + routes**

Create `lib/kvClient.ts` (binds the real Vercel KV to the store):
```ts
import { kv } from "@vercel/kv";
import { makeKvStore, type KvLike } from "./kv";

export const boardStore = makeKvStore(kv as unknown as KvLike);
```

Create `app/api/cron/refresh/route.ts`:
```ts
import { NextResponse } from "next/server";
import { fetchTopMarkets } from "@/lib/board";
import { boardStore } from "@/lib/kvClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const markets = await fetchTopMarkets();
  const fetchedAt = new Date().toISOString();
  if (markets.length) await boardStore.writeBoard(markets, fetchedAt);
  return NextResponse.json({ ok: true, count: markets.length, fetchedAt });
}
```

Create `app/api/board/route.ts`:
```ts
import { NextResponse } from "next/server";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await boardStore.readBoard();
    if (payload) return NextResponse.json(payload);
  } catch (err) {
    console.warn("KV read failed, falling back to direct fetch", err);
  }
  // Degrade gracefully: direct (uncached) fetch if KV is empty/unavailable.
  const markets = await fetchTopMarkets();
  return NextResponse.json({ markets, moves: {}, fetchedAt: new Date().toISOString() });
}
```

Create `app/api/history/[series]/[ticker]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { fetchKalshiMarketHistory } from "@/lib/sources";

export const revalidate = 3600; // cache candlestick history for ~1h

export async function GET(
  req: Request,
  { params }: { params: { series: string; ticker: string } },
) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 90);
  const interval = Number(url.searchParams.get("interval") ?? 1440);
  const points = await fetchKalshiMarketHistory(params.series, params.ticker, { days, periodInterval: interval });
  return NextResponse.json({ points });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- app/api/board/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the cron schedule**

Create `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/refresh", "schedule": "*/10 * * * *" }]
}
```

Create `.env.local.example`:
```
# Vercel KV (Upstash) - set in Vercel project settings for prod
KV_REST_API_URL=
KV_REST_API_TOKEN=
# Protects the cron endpoint (Vercel sends this as the Authorization bearer)
CRON_SECRET=
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds; the three routes appear in the route manifest.

- [ ] **Step 7: Commit**

```bash
git add app/api lib/kvClient.ts vercel.json .env.local.example && git commit -m "feat: cron refresh, board read, and history proxy routes"
```

---

## Task 9: Theme, layout shell, and shared UI primitives

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`
- Create: `components/ProbBadge.tsx`, `components/ThemeChip.tsx`
- Test: `components/ProbBadge.test.tsx`

- [ ] **Step 1: Set CSS variables + Tailwind theme**

In `app/globals.css`, after the Tailwind directives, add:
```css
:root {
  --bg: #0e1117; --panel: #262730; --text: #fafafa; --muted: #888888;
  --accent: #4c9be8; --green: #22c55e; --yellow: #eab308; --orange: #f97316; --red: #ef4444;
}
body { background: var(--bg); color: var(--text); }
.transition-prob { transition: color 250ms ease, background-color 250ms ease; }
```

In `tailwind.config.ts`, extend colours:
```ts
theme: { extend: { colors: {
  bg: "#0e1117", panel: "#262730", muted: "#888888", accent: "#4c9be8",
  pos: "#22c55e", warn: "#eab308", elev: "#f97316", neg: "#ef4444",
} } }
```

- [ ] **Step 2: Root layout with nav**

Replace `app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macro Signals",
  description: "Live prediction-market probabilities across macro themes (Kalshi + Polymarket).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-[var(--text)] antialiased">
        <header className="border-b border-white/10">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold text-[var(--text)]">Macro Signals</Link>
            <Link href="/timeline" className="text-muted hover:text-[var(--text)]">Timeline</Link>
            <Link href="/scenario" className="text-muted hover:text-[var(--text)]">Scenario</Link>
            <Link href="/about" className="ml-auto text-muted hover:text-[var(--text)]">About</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Write the failing test for ProbBadge**

Create `components/ProbBadge.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProbBadge } from "./ProbBadge";

describe("ProbBadge", () => {
  it("renders the percentage and colour band", () => {
    render(<ProbBadge prob={0.9} />);
    const el = screen.getByText("90.0%");
    expect(el).toBeTruthy();
    expect(el.style.color).toContain("239"); // #ef4444 -> rgb(239,68,68)
  });
  it("renders em dash for null", () => {
    render(<ProbBadge prob={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- components/ProbBadge.test.tsx`
Expected: FAIL - module not found.

- [ ] **Step 5: Implement ProbBadge + ThemeChip**

Create `components/ProbBadge.tsx`:
```tsx
import { pct, probColor } from "@/lib/format";

export function ProbBadge({ prob, decimals = 1, className = "" }: { prob: number | null; decimals?: number; className?: string }) {
  return (
    <span className={`transition-prob font-bold tabular-nums ${className}`} style={{ color: probColor(prob) }}>
      {pct(prob, decimals)}
    </span>
  );
}
```

Create `components/ThemeChip.tsx`:
```tsx
const THEME_COLOURS: Record<string, string> = {
  "Rates/Fed": "#4c9be8", Inflation: "#f97316", "Growth/Recession": "#22c55e",
  "Commodities/Oil": "#eab308", Geopolitics: "#ef4444", "Elections/Politics": "#b39ddb",
};

export function ThemeChip({ theme, active = true, onClick }: { theme: string; active?: boolean; onClick?: () => void }) {
  const c = THEME_COLOURS[theme] ?? "#4c9be8";
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? "text-[var(--text)]" : "text-muted"}`}
      style={{ borderColor: c, backgroundColor: active ? `${c}22` : "transparent" }}
    >
      {theme}
    </button>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- components/ProbBadge.test.tsx`
Expected: PASS (2 cases).

- [ ] **Step 7: Commit**

```bash
git add app/globals.css app/layout.tsx tailwind.config.ts components/ProbBadge.tsx components/ThemeChip.tsx components/ProbBadge.test.tsx && git commit -m "feat: theme, layout shell, ProbBadge + ThemeChip primitives"
```

---

## Task 10: Board view (cards + filters + table toggle)

Client component reads `/api/board`, renders theme-grouped cards with filters and a power-user table toggle. Mirrors `7_Macro_Signals.py` Tab 1.

**Files:**
- Create: `components/MarketCard.tsx`, `components/BoardFilters.tsx`, `components/BoardTable.tsx`, `components/BoardView.tsx`
- Modify: `app/page.tsx`
- Test: `components/BoardView.test.tsx`

- [ ] **Step 1: Write the failing test (filtering logic)**

Create `components/BoardView.test.tsx` — mounts `BoardView` with injected markets (no network) and checks theme filter + search behaviour.
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BoardView } from "./BoardView";
import type { BoardPayload } from "@/lib/types";

const payload: BoardPayload = {
  fetchedAt: "2026-07-15T10:00:00",
  moves: { a: 0.05 },
  markets: [
    { id: "a", platform: "Kalshi", title: "Fed cut in March?", category: "Rates/Fed", prob: 0.6, volume: 1000, endDate: "2026-03-18", status: "active", series: "KXFED", event: "E1" },
    { id: "b", platform: "Polymarket", title: "US recession in 2026?", category: "Growth/Recession", prob: 0.3, volume: 5000, endDate: "2026-12-31", status: "active", series: "", event: "" },
  ],
};

describe("BoardView", () => {
  it("renders both markets initially", () => {
    render(<BoardView initial={payload} />);
    expect(screen.getByText(/Fed cut in March/)).toBeTruthy();
    expect(screen.getByText(/US recession in 2026/)).toBeTruthy();
  });
  it("search narrows results", () => {
    render(<BoardView initial={payload} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "recession" } });
    expect(screen.queryByText(/Fed cut in March/)).toBeNull();
    expect(screen.getByText(/US recession in 2026/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- components/BoardView.test.tsx`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement MarketCard**

Create `components/MarketCard.tsx`:
```tsx
import Link from "next/link";
import { ProbBadge } from "./ProbBadge";
import { fmtVol, daysTo } from "@/lib/format";
import type { Market } from "@/lib/types";

export function MarketCard({ m, move }: { m: Market; move?: number }) {
  const d = daysTo(m.endDate);
  const resolves = d != null && d >= 0 ? `in ${d}d` : m.endDate || "—";
  return (
    <Link
      href={`/market/${encodeURIComponent(m.id)}`}
      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-panel/40 p-4 transition-colors hover:border-white/25"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm leading-snug text-[var(--text)]">{m.title.slice(0, 120)}</span>
        <ProbBadge prob={m.prob} className="text-xl" />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>{m.platform}</span>
        <span>·</span>
        <span>Vol {fmtVol(m.volume)}</span>
        <span>·</span>
        <span>{resolves}</span>
        {move != null && Math.abs(move) >= 0.001 && (
          <span className="ml-auto tabular-nums" style={{ color: move >= 0 ? "#22c55e" : "#ef4444" }}>
            {move >= 0 ? "+" : ""}{(move * 100).toFixed(1)}pp
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Implement BoardFilters + BoardTable + BoardView**

Create `components/BoardFilters.tsx`:
```tsx
"use client";
import { CATEGORIES } from "@/lib/taxonomy";
import { ThemeChip } from "./ThemeChip";

export interface Filters { themes: Set<string>; platform: string; search: string; probLo: number; probHi: number; headlineOnly: boolean; }

export function BoardFilters({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const toggleTheme = (t: string) => {
    const next = new Set(filters.themes);
    next.has(t) ? next.delete(t) : next.add(t);
    setFilters({ ...filters, themes: next });
  };
  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((t) => <ThemeChip key={t} theme={t} active={filters.themes.has(t)} onClick={() => toggleTheme(t)} />)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search markets…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="w-56 rounded-lg border border-white/10 bg-panel/40 px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={filters.platform}
          onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
          className="rounded-lg border border-white/10 bg-panel/40 px-2 py-1.5 text-sm"
        >
          <option>All</option><option>Kalshi</option><option>Polymarket</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={filters.headlineOnly} onChange={(e) => setFilters({ ...filters, headlineOnly: e.target.checked })} />
          Headline per event
        </label>
      </div>
    </div>
  );
}
```

Create `components/BoardTable.tsx`:
```tsx
import { pct, fmtVol, probColor, daysTo } from "@/lib/format";
import type { Market } from "@/lib/types";

export function BoardTable({ markets, moves }: { markets: Market[]; moves: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr><th className="py-2">Market</th><th>P</th><th>Δ</th><th>Vol</th><th>Resolves</th><th>Platform</th></tr>
      </thead>
      <tbody>
        {markets.map((m) => {
          const mv = moves[m.id];
          const d = daysTo(m.endDate);
          return (
            <tr key={m.id} className="border-t border-white/5">
              <td className="py-2 pr-3">{m.title.slice(0, 90)}</td>
              <td style={{ color: probColor(m.prob) }} className="font-bold tabular-nums">{pct(m.prob)}</td>
              <td className="tabular-nums" style={{ color: mv == null ? "#888" : mv >= 0 ? "#22c55e" : "#ef4444" }}>
                {mv == null ? "—" : `${mv >= 0 ? "+" : ""}${(mv * 100).toFixed(1)}pp`}
              </td>
              <td>{fmtVol(m.volume)}</td>
              <td>{d != null && d >= 0 ? `${m.endDate} (${d}d)` : m.endDate || "—"}</td>
              <td>{m.platform}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

Create `components/BoardView.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import { BoardFilters, type Filters } from "./BoardFilters";
import { BoardTable } from "./BoardTable";
import { MarketCard } from "./MarketCard";
import { CATEGORIES } from "@/lib/taxonomy";
import { representativeByEvent, groupByCategory } from "@/lib/board";
import type { BoardPayload, Market } from "@/lib/types";

export function BoardView({ initial }: { initial: BoardPayload }) {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [filters, setFilters] = useState<Filters>({
    themes: new Set(CATEGORIES), platform: "All", search: "", probLo: 0, probHi: 100, headlineOnly: true,
  });

  const filtered = useMemo(() => {
    let rows: Market[] = filters.headlineOnly ? representativeByEvent(initial.markets) : [...initial.markets];
    rows = rows.filter((r) => filters.themes.has(r.category));
    if (filters.platform !== "All") rows = rows.filter((r) => r.platform === filters.platform);
    rows = rows.filter((r) => r.prob != null && r.prob * 100 >= filters.probLo && r.prob * 100 <= filters.probHi);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(s));
    }
    rows.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    return rows;
  }, [initial.markets, filters]);

  const grouped = useMemo(() => groupByCategory(filtered, 25), [filtered]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-muted">
          {filtered.length} markets · updated {new Date(initial.fetchedAt).toLocaleString()}
        </p>
        <button className="text-xs text-muted underline" onClick={() => setView(view === "cards" ? "table" : "cards")}>
          {view === "cards" ? "Table view" : "Card view"}
        </button>
      </div>
      <BoardFilters filters={filters} setFilters={setFilters} />
      {Object.keys(grouped).length === 0 && <p className="text-muted">No markets match the current filters.</p>}
      {Object.entries(grouped).map(([cat, members]) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">{cat} · {members.length}</h2>
          {view === "cards" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => <MarketCard key={m.id} m={m} move={initial.moves[m.id]} />)}
            </div>
          ) : (
            <BoardTable markets={members} moves={initial.moves} />
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Wire the home page (server component fetches the board)**

Replace `app/page.tsx`:
```tsx
import { BoardView } from "@/components/BoardView";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";
import type { BoardPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getBoard(): Promise<BoardPayload> {
  try {
    const cached = await boardStore.readBoard();
    if (cached) return cached;
  } catch { /* fall through to direct fetch */ }
  const markets = await fetchTopMarkets();
  return { markets, moves: {}, fetchedAt: new Date().toISOString() };
}

export default async function HomePage() {
  const board = await getBoard();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Macro Signals</h1>
      <p className="mb-6 text-sm text-muted">
        Live prediction-market probabilities across macro themes, from the Kalshi &amp; Polymarket public APIs.
      </p>
      {board.markets.length === 0 ? (
        <p className="text-muted">No live markets right now — check back shortly.</p>
      ) : (
        <BoardView initial={board} />
      )}
    </>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- components/BoardView.test.tsx`
Expected: PASS (2 cases).

- [ ] **Step 7: Verify in the browser**

Seed local KV or rely on the direct-fetch fallback. Start the dev server (via the preview tool / `npm run dev`), open the home page, and confirm: cards render grouped by theme, theme chips filter, search narrows, table toggle switches. Capture a screenshot. Check the browser console for errors.

- [ ] **Step 8: Commit**

```bash
git add components/MarketCard.tsx components/BoardFilters.tsx components/BoardTable.tsx components/BoardView.tsx components/BoardView.test.tsx app/page.tsx && git commit -m "feat: board view with cards, filters, and table toggle"
```

---

## Task 11: Market detail (probability timeline)

**Files:**
- Create: `app/market/[id]/page.tsx`, `components/charts/ProbTimeline.tsx`, `components/MarketDetail.tsx`
- (Reuses `/api/history/...` from Task 8.)

- [ ] **Step 1: Implement the timeline chart (Recharts)**

Create `components/charts/ProbTimeline.tsx`:
```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { HistoryPoint } from "@/lib/types";

export function ProbTimeline({ points }: { points: HistoryPoint[] }) {
  const data = points.map(([ts, p]) => ({ ts: ts.slice(0, 10), prob: +(p * 100).toFixed(1) }));
  if (data.length < 2) return <p className="text-sm text-muted">No price history available for this market.</p>;
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#1e2130" />
        <XAxis dataKey="ts" tick={{ fill: "#888", fontSize: 11 }} minTickGap={40} />
        <YAxis domain={[0, 100]} tick={{ fill: "#888", fontSize: 11 }} width={36} />
        <Tooltip
          contentStyle={{ background: "#0e1117", border: "1px solid #1e2130", color: "#fafafa" }}
          formatter={(v: number) => [`${v}%`, "P"]}
        />
        <Line type="monotone" dataKey="prob" stroke="#4c9be8" strokeWidth={2} dot={false} isAnimationActive />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Implement the detail client + page**

Create `components/MarketDetail.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { ProbTimeline } from "./charts/ProbTimeline";
import { ProbBadge } from "./ProbBadge";
import { fmtVol, daysTo } from "@/lib/format";
import type { Market, HistoryPoint } from "@/lib/types";

export function MarketDetail({ m }: { m: Market }) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [lookback, setLookback] = useState(90);

  useEffect(() => {
    if (m.platform !== "Kalshi" || !m.series) { setPoints([]); return; }
    setPoints(null);
    fetch(`/api/history/${encodeURIComponent(m.series)}/${encodeURIComponent(m.id)}?days=${lookback}&interval=1440`)
      .then((r) => r.json()).then((d) => setPoints(d.points ?? [])).catch(() => setPoints([]));
  }, [m.id, m.series, m.platform, lookback]);

  const d = daysTo(m.endDate);
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">{m.title}</h1>
        <ProbBadge prob={m.prob} className="text-3xl" />
      </div>
      <div className="mb-6 flex flex-wrap gap-4 text-sm text-muted">
        <span>{m.category}</span><span>{m.platform}</span>
        <span>Vol {fmtVol(m.volume)}</span>
        <span>Resolves {m.endDate || "—"}{d != null && d >= 0 ? ` (${d}d)` : ""}</span>
      </div>
      {m.platform === "Kalshi" && m.series && (
        <div className="mb-3 flex gap-2">
          {[30, 90, 180].map((n) => (
            <button key={n} onClick={() => setLookback(n)}
              className={`rounded px-2 py-1 text-xs ${lookback === n ? "bg-accent/20 text-[var(--text)]" : "text-muted"}`}>
              {n}d
            </button>
          ))}
        </div>
      )}
      {points === null ? <p className="text-sm text-muted">Loading history…</p> : <ProbTimeline points={points} />}
    </div>
  );
}
```

Create `app/market/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  let markets;
  try {
    markets = (await boardStore.readBoard())?.markets;
  } catch { /* fall through */ }
  if (!markets) markets = await fetchTopMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) notFound();
  return <MarketDetail m={m} />;
}
```

- [ ] **Step 3: Verify build + browser**

Run: `npm run build` (expect success).
In the browser: click a Kalshi card from the board; confirm the timeline renders (or a graceful "no history" note for Polymarket / brand-new markets), and lookback buttons re-fetch. Check the network panel: the `/api/history/...` call should return `{ points: [...] }`. Capture a screenshot.

- [ ] **Step 4: Commit**

```bash
git add app/market components/MarketDetail.tsx components/charts/ProbTimeline.tsx && git commit -m "feat: market detail with probability timeline"
```

---

## Task 12: Scenario Builder

**Files:**
- Create: `app/scenario/page.tsx`, `components/ScenarioBuilder.tsx`, `components/charts/LegBars.tsx`
- Test: `components/ScenarioBuilder.test.tsx`

- [ ] **Step 1: Write the failing test (joint/at-least-one output)**

Create `components/ScenarioBuilder.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioBuilder } from "./ScenarioBuilder";
import type { Market } from "@/lib/types";

const mk = (id: string, title: string, cat: string, prob: number): Market => ({
  id, platform: "Kalshi", title, category: cat as Market["category"], prob, volume: 100,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

describe("ScenarioBuilder", () => {
  it("computes joint and at-least-one for two picked legs", () => {
    render(<ScenarioBuilder markets={[mk("a", "Fed cut", "Rates/Fed", 0.5), mk("b", "Recession", "Growth/Recession", 0.4)]} />);
    fireEvent.click(screen.getByText(/Fed cut/));
    fireEvent.click(screen.getByText(/Recession/));
    expect(screen.getByText("20.0%")).toBeTruthy(); // joint 0.5*0.4
    expect(screen.getByText("70.0%")).toBeTruthy(); // at-least-one 1-(0.5*0.6)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- components/ScenarioBuilder.test.tsx`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement LegBars + ScenarioBuilder + page**

Create `components/charts/LegBars.tsx`:
```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import type { Market } from "@/lib/types";

export function LegBars({ legs }: { legs: Market[] }) {
  const data = legs.map((l) => ({ name: l.title.slice(0, 40), prob: +((l.prob ?? 0) * 100).toFixed(1) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, legs.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fill: "#888", fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={180} tick={{ fill: "#fafafa", fontSize: 11 }} />
        <Bar dataKey="prob" radius={4}>{data.map((_, i) => <Cell key={i} fill="#4c9be8" />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

Create `components/ScenarioBuilder.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import { jointYes, atLeastOne } from "@/lib/scenario";
import { pct } from "@/lib/format";
import { LegBars } from "./charts/LegBars";
import { representativeByEvent } from "@/lib/board";
import type { Market } from "@/lib/types";

export function ScenarioBuilder({ markets }: { markets: Market[] }) {
  const options = useMemo(() => {
    const opts = representativeByEvent(markets).filter((r) => r.prob != null);
    opts.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    return opts.slice(0, 150);
  }, [markets]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const legs = options.filter((o) => picked.has(o.id));
  const toggle = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const probs = legs.map((l) => l.prob as number);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Scenario Builder</h1>
      <p className="mb-6 text-sm text-muted">
        Pick two or more markets to read the joint probability of all resolving YES, and of at least one.
        Both assume independence — real markets are often correlated, so treat these as bounds, not gospel.
      </p>
      {legs.length >= 2 && (
        <div className="mb-6 flex gap-8">
          <div><div className="text-xs text-muted">P(all resolve YES)</div><div className="text-2xl font-bold text-accent">{pct(jointYes(probs))}</div></div>
          <div><div className="text-xs text-muted">P(at least one)</div><div className="text-2xl font-bold text-accent">{pct(atLeastOne(probs))}</div></div>
        </div>
      )}
      {legs.length >= 2 && <div className="mb-6"><LegBars legs={legs} /></div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${picked.has(o.id) ? "border-accent" : "border-white/10"}`}>
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
            <span className="text-muted">[{o.category}]</span>
            <span className="flex-1">{o.title.slice(0, 80)}</span>
            <span className="tabular-nums text-muted">{pct(o.prob, 0)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

Create `app/scenario/page.tsx`:
```tsx
import { ScenarioBuilder } from "@/components/ScenarioBuilder";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function ScenarioPage() {
  let markets;
  try { markets = (await boardStore.readBoard())?.markets; } catch { /* fall through */ }
  if (!markets) markets = await fetchTopMarkets();
  return <ScenarioBuilder markets={markets} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- components/ScenarioBuilder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify build + browser, then commit**

Run: `npm run build` (expect success). In the browser, pick 2+ legs and confirm the two metrics + bar chart update. Screenshot.
```bash
git add app/scenario components/ScenarioBuilder.tsx components/charts/LegBars.tsx components/ScenarioBuilder.test.tsx && git commit -m "feat: scenario builder (joint + at-least-one)"
```

---

## Task 13: Timeline view (term-structure bubble chart)

**Files:**
- Create: `app/timeline/page.tsx`, `components/TimelineView.tsx`, `components/charts/TimelineBubble.tsx`

- [ ] **Step 1: Implement the bubble chart (Recharts ScatterChart)**

Create `components/charts/TimelineBubble.tsx`:
```tsx
"use client";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { probColor, fmtVol } from "@/lib/format";
import type { Market } from "@/lib/types";

export function TimelineBubble({ markets }: { markets: Market[] }) {
  const data = markets
    .filter((m) => m.prob != null && m.endDate)
    .map((m) => ({ x: new Date(`${m.endDate}T00:00:00Z`).getTime(), y: +((m.prob as number) * 100).toFixed(1), z: m.volume || 1, title: m.title, prob: m.prob as number }));
  if (!data.length) return <p className="text-sm text-muted">No dated markets match the selected themes.</p>;
  return (
    <ResponsiveContainer width="100%" height={480}>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: 4 }}>
        <CartesianGrid stroke="#1e2130" />
        <XAxis type="number" dataKey="x" domain={["dataMin", "dataMax"]} name="Resolves"
          tickFormatter={(t) => new Date(t).toISOString().slice(0, 10)} tick={{ fill: "#888", fontSize: 11 }} />
        <YAxis type="number" dataKey="y" domain={[0, 100]} name="P" tick={{ fill: "#888", fontSize: 11 }} width={36} />
        <ZAxis type="number" dataKey="z" range={[40, 800]} />
        <ReferenceLine x={Date.now()} stroke="#888" strokeDasharray="3 3" />
        <Tooltip
          contentStyle={{ background: "#0e1117", border: "1px solid #1e2130" }}
          formatter={(v: number, n: string) => (n === "P" ? [`${v}%`, "P"] : [v, n])}
          labelFormatter={() => ""}
        />
        <Scatter data={data}>{data.map((d, i) => <Cell key={i} fill={probColor(d.prob)} fillOpacity={0.85} />)}</Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Implement TimelineView + page**

Create `components/TimelineView.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/taxonomy";
import { ThemeChip } from "./ThemeChip";
import { TimelineBubble } from "./charts/TimelineBubble";
import { representativeByEvent } from "@/lib/board";
import { daysTo } from "@/lib/format";
import type { Market } from "@/lib/types";

export function TimelineView({ markets }: { markets: Market[] }) {
  const [themes, setThemes] = useState<Set<string>>(new Set(["Rates/Fed"]));
  const toggle = (t: string) => { const n = new Set(themes); n.has(t) ? n.delete(t) : n.add(t); setThemes(n); };
  const pts = useMemo(() =>
    representativeByEvent(markets).filter((r) => themes.has(r.category) && r.prob != null && (daysTo(r.endDate) ?? -1) >= 0),
    [markets, themes]);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Timeline</h1>
      <p className="mb-4 text-sm text-muted">
        Term structure of priced macro risk: each market by resolution date (x) and implied probability (y), bubble size = volume.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((t) => <ThemeChip key={t} theme={t} active={themes.has(t)} onClick={() => toggle(t)} />)}
      </div>
      <TimelineBubble markets={pts} />
      <p className="mt-2 text-xs text-muted">{pts.length} dated markets · bubble size ∝ volume · colour = probability.</p>
    </div>
  );
}
```

Create `app/timeline/page.tsx`:
```tsx
import { TimelineView } from "@/components/TimelineView";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  let markets;
  try { markets = (await boardStore.readBoard())?.markets; } catch { /* fall through */ }
  if (!markets) markets = await fetchTopMarkets();
  return <TimelineView markets={markets} />;
}
```

- [ ] **Step 3: Verify build + browser, then commit**

Run: `npm run build` (expect success). In the browser, toggle themes and confirm bubbles change; hover shows P; the "today" reference line is visible. Screenshot.
```bash
git add app/timeline components/TimelineView.tsx components/charts/TimelineBubble.tsx && git commit -m "feat: timeline term-structure bubble chart"
```

---

## Task 14: About / methodology page

**Files:**
- Create: `app/about/page.tsx`

- [ ] **Step 1: Implement the page**

Create `app/about/page.tsx`:
```tsx
import { KALSHI_MACRO_SERIES } from "@/lib/taxonomy";

export default function AboutPage() {
  const series = Object.entries(KALSHI_MACRO_SERIES).sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]));
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-2xl font-semibold">About</h1>
      <p className="text-sm text-muted">
        Macro Signals shows live prediction-market probabilities across macro themes, pulled from the
        Kalshi and Polymarket public APIs and refreshed about every 10 minutes.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Data sources</h2>
      <ul className="list-disc pl-5 text-sm text-muted">
        <li><strong>Kalshi</strong> — queried by a curated allowlist of macro series (stable; the markets inside churn). Covers rates / inflation / growth / commodities.</li>
        <li><strong>Polymarket</strong> — top markets by volume, keyword-tagged. Covers elections / geopolitics.</li>
      </ul>
      <p className="text-sm text-muted">
        Volume units differ across platforms (Kalshi = contracts, Polymarket = USD), so compare within a theme, not across.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Curated Kalshi series</h2>
      <table className="text-sm">
        <thead><tr><th className="pr-6 text-left">Series</th><th className="text-left">Theme</th></tr></thead>
        <tbody>{series.map(([s, t]) => <tr key={s}><td className="pr-6">{s}</td><td>{t}</td></tr>)}</tbody>
      </table>
      <p className="mt-6 text-xs text-muted">
        For information only. This is not financial advice, and prediction-market prices are not forecasts or recommendations.
      </p>
    </article>
  );
}
```

- [ ] **Step 2: Verify build, then commit**

Run: `npm run build` (expect success).
```bash
git add app/about && git commit -m "feat: about / methodology page"
```

---

## Task 15: Full test + build gate, README, deploy notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the full suite**

Run: `npm run test`
Expected: ALL tests pass (taxonomy, categorise, parse, normalise, sources, board, history, scenario, format, kv, board route, ProbBadge, BoardView, ScenarioBuilder).

- [ ] **Step 2: Full production build**

Run: `npm run build`
Expected: success; all routes + pages compile.

- [ ] **Step 3: Write README with deploy steps**

Create `README.md` covering: what the site is; `npm run dev` / `test` / `build`; the Vercel deploy checklist (create project, add Vercel KV integration which sets `KV_REST_API_URL`/`KV_REST_API_TOKEN`, set `CRON_SECRET`, confirm the cron in `vercel.json` runs `/api/cron/refresh` every 10 min, hit `/api/cron/refresh` once manually to seed the cache, set a custom domain). Note that Polymarket is reachable from Vercel's US region but blocked on the Rochford network locally, so local dev shows Kalshi-only unless off-network.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: README with local dev + Vercel deploy checklist"
```

- [ ] **Step 5: Deploy (manual, by Charlie — outside this plan's automation)**

Deployment (creating the Vercel project, provisioning KV, setting env vars, pointing DNS) is a manual step Charlie performs — the plan produces a deploy-ready repo, not a live site. See README.

---

## Self-review notes (author)

- **Spec coverage:** v1 views Board (Task 10), Market detail (Task 11), Scenario (Task 12), Timeline (Task 13), About (Task 14); architecture — cron/board/history routes (Task 8), KV cache (Task 7); data-layer port — Tasks 1-6; design system — Task 9. All spec §2/§3/§4/§5 items map to a task. v2 backlog (spec §9) intentionally not built; `topMovers`/`themeConviction`/`marketProbSeries` are ported+tested in Task 6 so the port is complete and the v2 Market Map can consume them without re-porting.
- **Type consistency:** `Market`/`Snapshot`/`BoardPayload`/`HistoryPoint` defined in Task 3 and used unchanged in Tasks 4-13. `makeKvStore` (Task 7) consumed by `kvClient`/routes (Task 8). `representativeByEvent`/`groupByCategory` (Task 5) reused in Board/Scenario/Timeline. Formatter names (`fmtVol`,`pct`,`probColor`,`daysTo`) consistent across components.
- **Placeholder scan:** no TBD/TODO in task steps; every code step contains full code; the only deferred items are the explicitly-scoped v2 backlog and the manual deploy (Task 15 Step 5), both intentional.
- **Determinism:** the only `Date.now()` in tested code (`fetchKalshiMarketHistory`) is overridden by `nowTs` in every test.
