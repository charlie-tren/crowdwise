# Macro Signals - standalone website (design spec)

**Date:** 15/07/2026
**Author:** Charlie Trenorden (with Claude)
**Status:** Draft for review

## 1. Summary

Extract the "Macro Signals" module from the Vantage Streamlit app into a
standalone, public, responsive website that displays live prediction-market
probabilities (Kalshi + Polymarket) across macro themes. Read-only - it shows
odds, it does not offer trading.

- **Ownership/brand:** Personal / independent. No Rochford association, no firm
  compliance review. Full design freedom.
- **Audience:** Public / open internet.
- **Stack:** Next.js (App Router) + TypeScript, deployed on Vercel. The Python
  data layer is ported to TypeScript (not reused at runtime).
- **Source of truth being ported:** `Vantage/core/macro_signals_data.py` only.
  The parked frameworks (`core/polymarket_calculations.py`,
  `core/polymarket_config.py`) are **not** ported - the live page never imported
  them.

## 2. Scope

### v1 (this build)
1. **Board** - card grid of live macro markets, grouped by theme, with filters
   (theme, platform, search, probability range) and a power-user table toggle.
2. **Market detail** - probability timeline (Kalshi candlesticks) + resolution
   info + link out to the platform.
3. **Scenario Builder** - pick >=2 markets, show joint P(all YES) and
   P(at least one), assuming independence (flagged as bounds, not gospel).
4. **Timeline** - term-structure bubble chart: resolution date (x) vs implied
   probability (y), bubble size = volume.
5. **About / methodology** - data sources, curated Kalshi series, "not financial
   advice / for information only" note.

### v2+ (documented, not built yet) - see Section 9
- Market Map (treemap size=volume colour=probability)
- Conviction scatter (probability vs volume, log)
- Top Movers (Kalshi candlestick deltas over a window)
- Possible restoration of the parked hand-curated frameworks (GPR index, US
  Expansionism, Oil Supply Risk, Policy Matrix)

### Explicitly out of scope
- Trading, wallets, accounts, auth, KYC, payments (it is read-only).
- Gamification / XP / streaks (irrelevant to a data site).
- Bloomberg data (the whole point of the source redesign was to be BBG-free).

## 3. Architecture

### The public-traffic problem
Visitors must never each hit the Kalshi/Polymarket APIs directly - that would
flood the upstreams and be slow. Data is fetched **once per interval,
server-side, and cached**; every visitor reads the cache.

```
                 Vercel Cron (~every 10 min)
                          |
                          v
        /api/cron/refresh  --fetch-->  Kalshi + Polymarket public APIs
                          |
                    normalise (ported data layer)
                          |
                writes board JSON + snapshot
                          v
                    Vercel KV (Upstash Redis)
                          ^
                          | read (instant)
        Browser  <---  /api/board  <---  Next.js route handler
                          |
        Browser  <---  /api/history/[series]/[ticker]  (on-demand, cached ~1h)
```

- **Framework:** Next.js App Router + TypeScript on Vercel.
- **Ingestion:** `GET /api/cron/refresh` (protected by a `CRON_SECRET`) pulls the
  curated Kalshi series + top Polymarket markets, normalises to the common
  record shape, writes the current board to KV under a stable key, and appends a
  timestamped probability snapshot (capped rolling history) for the "delta since
  last refresh" feature. Scheduled via `vercel.json` cron.
- **Read path:** `GET /api/board` returns the cached board from KV - O(1),
  traffic-independent. Includes `fetchedAt` and per-market `move` (delta vs the
  previous snapshot).
- **History:** `GET /api/history/[series]/[ticker]?days&interval` proxies the
  Kalshi candlesticks endpoint with route-level caching (`revalidate ~3600`), so
  repeated views of the same market don't re-fetch.
- **Hosting note:** Vercel functions run in the US, so `gamma-api.polymarket.com`
  is reachable (Polymarket is only ISP/DNS-blocked within Australia and
  sinkholed on the Rochford network). The hosted site therefore gets fuller
  elections/geopolitics coverage than the module shows on Charlie's local
  network.

### Data model (ported verbatim from the Python)
One normalised record per market (JSON-serialisable):

```ts
interface Market {
  id: string;          // platform-native id / ticker
  platform: "Kalshi" | "Polymarket";
  title: string;       // human-readable question
  category: Category;  // macro theme, or "Other"
  prob: number | null; // implied P(YES) in [0,1]
  volume: number;      // platform-native units (Kalshi=contracts, PM=USD)
  endDate: string;     // ISO date (YYYY-MM-DD) or ""
  status: string;      // "active" | "open" | "closed" | "settled" | ""
  series: string;      // Kalshi series ticker; "" for Polymarket
  event: string;       // Kalshi event ticker; "" for Polymarket
}

type Category =
  | "Rates/Fed" | "Inflation" | "Growth/Recession"
  | "Commodities/Oil" | "Geopolitics" | "Elections/Politics";
```

### Modules to port (TypeScript)
From `macro_signals_data.py`, mapped 1:1 into a small `lib/` layer:

| Python | TS module | Notes |
|---|---|---|
| `KALSHI_MACRO_SERIES`, `CATEGORIES`, keyword rules | `lib/taxonomy.ts` | curated allowlist + word-boundary regex categorisation |
| `categorise_market`, `is_macro_relevant` | `lib/categorise.ts` | word-boundary regex (keep the `\b` fix - "Tirante" != Iran) |
| `normalise_kalshi_market`, `normalise_polymarket_market`, parsing helpers | `lib/normalise.ts` | pure transforms; port `_first_outcome_price`, `_kalshi_prob`, `_clamp_prob`, etc. |
| `fetch_*`, `_http_get_json` | `lib/sources.ts` | single fetch seam (fetch API); best-effort per platform |
| `fetch_top_markets`, `group_by_category`, `representative_by_event` | `lib/board.ts` | orchestration + grouping + headline-per-event collapse |
| snapshot/move/history analytics | `lib/history.ts` | `compute_moves`, `top_movers`, `theme_conviction`, candlestick parsing |
| scenario math (inline in page) | `lib/scenario.ts` | joint = prod(p); at-least-one = 1 - prod(1-p) |

Everything in the data layer is pure + best-effort (network failures return
empty, never throw into the UI) - that property must be preserved in the port.

## 4. Design system

- **Look:** Dark, modern, clean. Personal brand (palette is free to diverge from
  Vantage, but the Vantage dark palette is a fine starting point).
- **Probability = the dominant visual.** Big percentage, colour-graded on a
  muted green->yellow->orange->red ramp (low P = green, high P = red), exact
  number always shown. Never colour alone - pair with the number/label
  (accessibility).
- **No flashing.** Number/colour changes ease over ~200-300ms. Muted, not
  stock-ticker-anxiety saturated.
- **Cards over tables** for discovery (with a table toggle for power use).
- **Mobile-first, progressive disclosure:** card -> tap -> detail. Single-column
  on mobile; multi-column grid on desktop. Touch targets >=44px.
- **Charts:** Recharts (or Tremor) - responsive, React-native, clean defaults.
- **Colours (starting point):** accent `#4c9be8`; green `#22c55e`, yellow
  `#eab308`, orange `#f97316`, red `#ef4444`; bg `#0e1117`, panel `#262730`,
  text `#fafafa`, muted `#888888`.

## 5. Views (v1 detail)

### Board (hero)
- Responsive card grid, grouped by theme (theme order = `CATEGORIES`).
- Card: question (truncated), big colour-graded %, delta chip (pp move since last
  refresh), volume (compact 1.2M/34k), resolution countdown ("in 12d"), platform
  badge.
- Filters: theme chips (multi), platform (All/Kalshi/Polymarket), free-text
  search, probability range. "Headline per event" toggle (default on) to collapse
  strike ladders to the highest-volume contract. Table-view toggle for power use.
- Summary counts (markets / themes / platforms).

### Market detail
- Probability timeline from Kalshi candlesticks (line chart; lookback 30/90/180d;
  daily/hourly). Polymarket markets have no candlestick feed -> show current
  probability + note (no history line).
- Resolution date + countdown, volume, platform, link out.

### Scenario Builder
- Multi-select >=2 markets (headline-per-event, volume-sorted, capped ~150).
- Outputs: P(all resolve YES) and P(at least one), plus per-leg bar chart.
- Independence caveat shown prominently.
- Port the one-click example presets (theme+keyword matched against the live
  board, since contract ids churn).

### Timeline
- Bubble scatter: x = resolution date, y = implied probability, size = volume,
  colour = probability. Theme filter. "Today" marker line.

### About / methodology
- Data sources (Kalshi curated series; Polymarket top-by-volume keyword-tagged),
  refresh cadence, volume-units caveat, and a plain "for information only, not
  financial advice" line.

## 6. Error handling & edge cases

- Any upstream fetch failure -> that platform contributes nothing; the board
  still renders from whatever succeeded (best-effort, as in the Python).
- Empty board -> friendly empty state, not a crash.
- `prob === null` markets excluded from prob-filtered views and charts; shown as
  "-" where listed.
- KV unavailable -> `/api/board` falls back to a direct (uncached) fetch so the
  site degrades rather than 500s (logged).
- Volume units differ across platforms - never compare across themes; UI copy
  says so.

## 7. Testing

- Port the Python unit tests for the data layer (there are existing
  `tests/test_macro_signals_data.py` cases) to TS (Vitest): categorisation
  (incl. the word-boundary proper-noun cases), normalisers, prob derivation,
  grouping, representative-by-event, scenario math, move computation.
- Fixture-driven: capture sample Kalshi + Polymarket API responses as JSON
  fixtures; the single fetch seam is mocked (mirrors the Python `_http_get_json`
  monkeypatch pattern).
- A smoke test that `/api/board` returns a well-formed payload from a seeded KV.

## 8. Build sequence (v1)

1. Scaffold Next.js + TS + Tailwind + testing (Vitest).
2. Port the data layer (`lib/*`) with tests - offline, fixture-driven, no UI yet.
3. `/api/cron/refresh` + KV write + `/api/board` read; seed and verify locally.
4. Board view (cards + filters + table toggle) against `/api/board`.
5. Market detail + `/api/history/...`.
6. Scenario Builder.
7. Timeline.
8. About page.
9. Deploy to Vercel, wire KV + cron + `CRON_SECRET`, custom domain.

## 9. v2+ backlog (documented now, per Charlie's request)

Carried over from the Streamlit module but deferred:

- **Market Map** - `go.Treemap` equivalent: tile = market, size proportional to
  volume, colour = probability, capped to top ~45 by volume for legibility.
  Hierarchy: root -> theme -> market. Recharts has no native treemap with this
  control; may need `visx` or a d3 treemap. (Source: Tab 2 "Market Map" A.)
- **Conviction scatter** - probability (x) vs volume (log y), coloured by theme,
  50% reference line. "High volume near 50% = genuinely contested macro risk."
  (Source: Tab 2 B.)
- **Top Movers** - biggest probability move over 24h/7d/30d from Kalshi
  candlesticks; button-gated + cached in the Streamlit version because it fetches
  per-market history. On the web build: precompute in the cron job (fetch top ~30
  Kalshi markets' candlestick deltas each refresh, store in KV) so it's instant
  and doesn't fan out on user click. (Source: Tab 2 C + `top_movers`,
  `history_move`.)
- **Trends multi-market overlay** - the Streamlit "Trends" tab overlays several
  markets' probability histories on one chart. v1 folds single-market history
  into Market detail; the multi-overlay is the v2 extension. (Source: Tab 3.)
- **Board snapshot history depth** - v1 keeps a short rolling snapshot in KV for
  the delta feature. A deeper own-history (beyond Kalshi's candlesticks, e.g. for
  Polymarket markets that lack a candlestick feed) would need a longer-lived
  store (KV list or a small DB). (Source: `save_board_snapshot` /
  `market_prob_series`.)
- **Parked hand-curated frameworks** - GPR index, US Expansionism, Oil Supply
  Risk, Policy Matrix. These live in `core/polymarket_calculations.py` +
  `data/polymarket_config.json` in Vantage. They encode hand-curated judgement
  against specific markets that churn (why they were parked). Only revisit if
  there's appetite to maintain the curation. (Source: `polymarket_calculations.py`.)
- **Alerts / notifications** - "notify me when P crosses X" is a natural public
  feature but needs accounts + a notification channel; out of the read-only v1.

## 10. Open questions / decisions deferred

- Domain name (personal) - TBD, decide before public launch.
- Exact charting lib (Recharts vs Tremor vs visx) - settle at scaffold time; v1
  needs line + bubble + bar, all of which Recharts covers.
- Whether to also keep a frozen `git clone` of Vantage as reference (default: no;
  the source file is read directly during the port).
