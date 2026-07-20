# Crowdwise

A public, read-only website showing live prediction-market probabilities (Kalshi + Polymarket) across macro themes - ported from the Vantage "Crowdwise" module. Built with Next.js (App Router) + TypeScript + Tailwind v4 and Recharts. Data is cached with Next.js ISR so public traffic is served from cache rather than hitting the upstream APIs on every request.

Note: the repo name and deploy id remain `macro-signals-web` (historical) - only the display name changed to Crowdwise.

## Local development

```bash
npm install
npm run dev    # http://localhost:3000
npm run test
npm run build
```

Notes:

- Polymarket's Gamma API is blocked on some networks (including corporate/AU ISPs), so locally you may only see Kalshi markets. From a US-hosted Vercel deployment, Polymarket is reachable.

## Architecture

Each page is an ISR (Incremental Static Regeneration) route with `revalidate = 300`: the rendered board is cached and regenerated at most once every 5 minutes, so the upstream APIs (Kalshi + Polymarket) are hit about once per interval per region rather than once per visitor. Per-market probability history comes from `/api/history/[series]/[ticker]` (Kalshi candlesticks, cached ~1h). The 7-day "top movers" chart is served by `/api/movers` (`revalidate = 600`), which computes candlestick deltas on demand. The data/calc layer lives in `lib/` and is fully unit-tested with Vitest.

No external datastore or cron scheduler is required. A dormant KV path (`lib/kvClient.ts`, `/api/cron/refresh`) remains in the codebase: if a Vercel KV / Upstash store is later connected (setting `KV_REST_API_URL` + `KV_REST_API_TOKEN`), it can be re-enabled to add the "delta since last refresh" board chips and instant precomputed movers.

## Vercel deploy checklist

1. Import the repo into Vercel (Next.js preset auto-detected) and deploy - that's the core of it.
2. Add a custom domain (Settings -> Domains) when ready.

That's all the app needs. `CRON_SECRET` (env var) and the GitHub Actions workflows are only relevant if you re-enable the optional KV path above.

## Not financial advice

Crowdwise displays prediction-market pricing for informational purposes only. It is not financial advice and should not be relied on to make investment or trading decisions.

## v2 backlog

See `docs/specs/2026-07-15-macro-signals-website-design.md` (section 9) for the deferred views: Market Map, conviction scatter, top movers, multi-market trends, and alerts.
