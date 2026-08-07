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

## Backlog (priority order)

1. **[P1] Digest email - "what the crowd repriced this week"** (DO FIRST). Weekly push
   (start weekly, maybe daily later) summarising the biggest odds moves + notable
   crowd-vs-Fed / cross-venue gaps. Uses stored snapshots + movers. The habit-former
   that turns a pull dashboard into a push product.
2. **[P1] Threshold move-alerts, user-subscribable.** User picks markets/themes + a move
   threshold (e.g. Fed-cut odds move >=10pp) and a delivery channel. **Inbox (email) is
   the primary channel** - users choose to have alerts delivered to their inbox; Teams /
   Slack webhook optional. Diff the precomputed movers against each user's thresholds.
3. **[P2] Crowd vs consensus.** Put prediction-market odds next to economist consensus /
   Fed dots / futures - the "who's right" framing, which is the core pitch. The Atlanta-Fed
   futures overlay already exists (`FedPathOverlay`); extend it to consensus / the dot plot.
4. **[P2] Shareable market cards.** A clean OG image per market / per distribution so links
   unfurl well on X/Slack and others spread them - promotion baked into the product.
5. **[P2] Track record / calibration page - "was the crowd right?"** Use the stored
   snapshots vs realised outcomes to show the crowd's calibration over time. Trust +
   repeat draw. (History is already being persisted, so the data exists.)
6. **[P3] Macro calendar tie-in.** Annotate what MOVED the odds (a CPI print, an FOMC
   statement) so a jump in the chart carries its narrative.
7. **[P3] Disagreement as the through-line.** Lean the whole product on crowd-vs-Fed /
   cross-venue disagreement (overlay + cross-venue page already built) - make it the
   homepage hook, not a buried sub-page.

## Promotion (growth plan, not code)
- Daily macro chart on X/FinTwit (Fed-path-vs-crowd, or the widest cross-venue gap)
  linking back - the flywheel; the tool's own visuals are the marketing.
- Newsletter as the owned channel; Reddit (r/econmonitor, r/PredictionMarkets, r/finance);
  LinkedIn / the personal hub for the professional angle.

## Older backlog (pre-existing)
- Non-Fed verbose titles (WTI oil strikes, jobs, GDP, geopolitics) left deliberately - no
  clean universal transform; only Fed titles are canonicalised (`displayTitle`).
- BoardTable click-sortable columns.
- Dormant Metaculus integration (`lib/metaculus.ts`) - revisit only if access opens.
- ~30 board rows show no trend sparkline: genuinely brand-new markets with <3 points of
  history even over 30d - by design, don't "fix" by faking a line.
