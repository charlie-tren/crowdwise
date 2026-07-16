# Macro Signals

A public, read-only website showing live prediction-market probabilities (Kalshi + Polymarket) across macro themes - ported from the Vantage "Macro Signals" module. Built with Next.js (App Router) + TypeScript + Tailwind v4, Recharts, and Vercel KV.

## Local development

```bash
npm install
npm run dev    # http://localhost:3000
npm run test
npm run build
```

Notes:

- Without Vercel KV env vars set locally, the pages fall back to fetching the board directly from the upstream APIs on each request - this is fine for dev.
- Polymarket's Gamma API is blocked on some networks (including corporate/AU ISPs), so locally you may only see Kalshi markets. From a US-hosted Vercel deployment, Polymarket is reachable.

## Architecture

A Vercel Cron job (`vercel.json`, every ~10 minutes) calls `/api/cron/refresh`, which fetches and normalises both platforms and writes the board to Vercel KV plus a rolling snapshot (used for the "delta since last refresh"). Page traffic reads the cached board via `/api/board`, so the upstream APIs see one fetch per interval regardless of visitor count. Per-market history comes from `/api/history/[series]/[ticker]` (Kalshi candlesticks). The data/calc layer lives in `lib/` and is fully unit-tested with Vitest.

## Vercel deploy checklist

1. Push the branch and import the repo into Vercel (Next.js preset auto-detected).
2. Add the Vercel KV integration (Upstash) to the project - this sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Set a `CRON_SECRET` env var (any random string). Vercel Cron sends it as the `Authorization: Bearer <CRON_SECRET>` header; `/api/cron/refresh` rejects calls without it.
4. Confirm the cron in `vercel.json` (`/api/cron/refresh`, `*/10 * * * *`) is registered (Vercel dashboard -> Cron Jobs).
5. After first deploy, hit `/api/cron/refresh` once manually (with the bearer header) to seed the cache, or wait for the first cron tick.
6. Add a custom domain.

## Not financial advice

Macro Signals displays prediction-market pricing for informational purposes only. It is not financial advice and should not be relied on to make investment or trading decisions.

## v2 backlog

See `docs/specs/2026-07-15-macro-signals-website-design.md` (section 9) for the deferred views: Market Map, conviction scatter, top movers, multi-market trends, and alerts.
