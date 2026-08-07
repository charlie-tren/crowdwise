# Crowdwise - TODO / feature backlog

Product direction (from the 2026-08-07 ideation): the wedge is **prediction markets
as a MACRO signal for markets/macro professionals** - "the crowd vs the Fed / vs
consensus". Raw odds are a commodity (anyone can hit the same APIs), so stickiness
must come from **synthesis + push**, not the dashboard. Growth is a content flywheel
(a daily chart on FinTwit linking back) + an owned email channel, not a launch.

## Existing building blocks (reuse these - don't rebuild)
- **KV store** (`lib/kv.ts` / `lib/kvClient.ts`): already persists the board, up to
  ~200 historical **snapshots**, and precomputed **movers**. → snapshots give the
  calibration/track-record history for free; movers give the alert deltas for free.
- **Cron route** (`app/api/cron/refresh`, `CRON_SECRET`-protected): the pattern for a
  scheduled send job already exists - add a sibling route, mind the Vercel Hobby cron cap.
- **Email**: Brevo (already used for One Story / The Aftertimes - single opt-in,
  authenticated domain). See [[html-email-gotchas]] and [[brevo-api-gotchas]].

## Shared prereq for the push features (digest + alerts)
- Subscriber store: add KV keys (e.g. `subscribers:digest`, `alerts:prefs:<email>`)
  holding email + per-user preferences.
- A subscribe UI (on-site box, single opt-in) and an unsubscribe path.

## Easiest AUTO wins (no accounts/secrets/external services, no subjective calls - I can build + verify end-to-end)
- **B1 Shareable OG market cards** (backlog #4) - pure code (Next.js `ImageResponse`), high promo value. Best first build.
- **B8 BoardTable click-sortable columns** (older backlog) - pure code, small.
- Semi-auto (buildable but need one input/decision from Charlie): #7 disagreement homepage hook (a layout choice), #3 crowd-vs-consensus *Fed-dots slice* (public SEP data, but confirm the source).
- NEEDS Charlie (external setup / consequential / data-source decision): #1 digest, #2 alerts (Brevo secrets + opt-in to actually send + subscribe flow), #5 calibration (needs an outcome-capture pipeline - snapshots store odds, not resolutions), #6 calendar (pick a calendar data feed).

## Backlog (priority = value x reach / effort; AUTO tag = can I do it unattended)

1. **[P1 · NEEDS-YOU] Digest email - "what the crowd repriced this week"** (highest value).
   Weekly push summarising the biggest odds moves + crowd-vs-Fed / cross-venue gaps. Uses
   stored snapshots + movers. Habit-former. *Blocked on: Brevo secrets, your opt-in to send,
   a subscribe UI decision.*
2. **[P1 · NEEDS-YOU] Threshold move-alerts, user-subscribable.** User picks markets/themes +
   a threshold (e.g. Fed-cut odds move >=10pp) + delivery channel. **Inbox (email) primary** -
   users opt to have alerts delivered to their inbox; Teams/Slack webhook optional. Diffs the
   precomputed movers. *Blocked on: subscriber store + prefs UI + Brevo + you approving sends.*
3. **[P2 · AUTO win up front, SEMI after] Crowd vs consensus.** Odds vs economist consensus /
   Fed dots / futures - the "who's right" framing, the core pitch. Futures overlay already
   exists (`FedPathOverlay`); the **Fed dot-plot (SEP) slice is public + buildable now**;
   economist consensus needs a source decision.
4. **[P2 · AUTO] Shareable market cards.** A clean OG image per market / distribution so links
   unfurl on X/Slack and others spread them - promotion baked in. **Easiest high-ROI auto win.**
5. **[P2 · SEMI/NEEDS-DATA] Track record / calibration - "was the crowd right?"** Snapshots vs
   realised outcomes over time. History (odds) is already persisted, but resolutions aren't -
   needs an outcome-capture step first.
6. **[P3 · NEEDS-SOURCE] Macro calendar tie-in.** Annotate what MOVED the odds (CPI, FOMC) so a
   jump carries its narrative. Needs an economic-calendar data feed.
7. **[P3 · SEMI-AUTO] Disagreement as the through-line.** Make crowd-vs-Fed / cross-venue
   disagreement the homepage hook, not a sub-page (overlay + cross-venue page already built).
   Buildable now, but the homepage layout is a taste call - show options first.

## Promotion (growth plan, not code)
- Daily macro chart on X/FinTwit (Fed-path-vs-crowd, or the widest cross-venue gap)
  linking back - the flywheel; the tool's own visuals are the marketing.
- Newsletter as the owned channel; Reddit (r/econmonitor, r/PredictionMarkets, r/finance);
  LinkedIn / the personal hub for the professional angle.

## Older backlog (pre-existing)
- **B8 [AUTO] BoardTable click-sortable columns** - pure code, small, unattended-buildable.
- Non-Fed verbose titles (WTI oil strikes, jobs, GDP, geopolitics) left deliberately - no
  clean universal transform; only Fed titles are canonicalised (`displayTitle`). WON'T-DO.
- Dormant Metaculus integration (`lib/metaculus.ts`) - BLOCKED, revisit only if access opens.
- ~30 board rows show no trend sparkline: genuinely brand-new markets with <3 points of
  history even over 30d - BY DESIGN, don't "fix" by faking a line.
