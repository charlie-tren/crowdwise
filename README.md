# Crowdwise

A public, read-only website showing live prediction-market probabilities (Kalshi + Polymarket) across macro themes - ported from the "Macro Signals" module of the author's Vantage app. Built with Next.js (App Router) + TypeScript + Tailwind v4 and Recharts.

## Local development

```bash
npm install
npm run dev    # http://localhost:3000
npm run test
npm run build
```

Notes:

- Polymarket's Gamma API is blocked on some networks (including corporate/AU ISPs), so locally you may only see Kalshi markets. The GitHub Actions build can reach it.

## Architecture

The site is a static export (`output: "export"`) served by a Cloudflare Worker with static assets, on the free plan. The board, every page, the `/api/board`, `/api/sparklines`, `/api/movers` and `/api/cross-venue` JSON and the OG images are built from one board fetch per build. The heartbeat Worker dispatches a `rebuild` to GitHub Actions every 15 minutes (the workflow's own schedule is the backup), which tests, builds and runs `wrangler deploy`. A build with an empty board fails, leaving the last deploy live.

`worker/index.ts` handles only what no static file matches: `/api/history/[series]/[ticker]` (Kalshi), `/api/poly-history/[token]` (Polymarket), `/api/market/[id]`, a client-rendered shell for a market that exists but was not built, and the 404 page. Responses are edge-cached for 5 minutes.

Market pages are built for the board plus off-board markets seen in the last 30 days (capped at 1,000). Each deploy publishes `/market-ids.json` and the next build reads it back.

`npm run dev` does not serve the history routes; `npm run build && npm run preview` runs the Worker locally.

## Deploy

Repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID`. Master deploys; other refs dry-run.

## Not financial advice

Crowdwise displays prediction-market pricing for informational purposes only. It is not financial advice and should not be relied on to make investment or trading decisions.

## v2 backlog

See `docs/specs/2026-07-15-macro-signals-website-design.md` (section 9) for the deferred views: Market Map, conviction scatter, top movers, multi-market trends, and alerts.
