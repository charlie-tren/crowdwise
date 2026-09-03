# Crowdwise - TODO / feature backlog

Product direction (from the 2026-08-07 ideation): the wedge is **prediction markets
as a MACRO signal for markets/macro professionals** - "the crowd vs the Fed / vs
consensus". Raw odds are a commodity (anyone can hit the same APIs), so stickiness
must come from **synthesis + push**, not the dashboard. Growth is a content flywheel
(a daily chart on FinTwit linking back) + an owned email channel, not a launch.

## Existing building blocks (reuse these - don't rebuild)
- **KV store** (`lib/kv.ts` / `lib/kvClient.ts`): the CODE to persist the board, ~200
  historical **snapshots** and precomputed **movers** exists and is wired to
  `@vercel/kv`. **CORRECTED 2026-08-07: do NOT assume it holds data.** There is no
  `vercel.json` and no cron configured (only `.github/workflows/ci.yml`), so nothing
  invokes `/api/cron/refresh` in prod - the KV is very likely empty and every route
  falls through to its live-fetch fallback. So the calibration history and alert
  deltas are **not** available for free yet: standing up the scheduled refresh (and
  confirming KV env vars are set) is a prerequisite for items 1, 2 and 5.
- **Cron route** (`app/api/cron/refresh`, `CRON_SECRET`-protected): the code pattern for
  a scheduled job exists but is **not scheduled**. Needs a `vercel.json` `crons` entry
  (mind the Vercel Hobby cap: 1/day) or an external trigger (a GitHub Actions cron
  hitting the URL with the secret is the cheaper, more flexible option).
- **Email**: Brevo (already used for One Story / The Aftertimes - single opt-in,
  authenticated domain). See [[html-email-gotchas]] and [[brevo-api-gotchas]].

## Shared prereq for the push features (digest + alerts)
- Subscriber store: add KV keys (e.g. `subscribers:digest`, `alerts:prefs:<email>`)
  holding email + per-user preferences.
- A subscribe UI (on-site box, single opt-in) and an unsubscribe path.

## Easiest AUTO wins (no accounts/secrets/external services, no subjective calls - I can build + verify end-to-end)
- ~~**B1 Shareable OG market cards**~~ **DONE** 2026-08-07 (d6e9772) - verified on prod.
- ~~**B8 BoardTable click-sortable columns**~~ **DONE** 2026-08-07 (d6e9772) - verified on prod.
- Remaining auto candidate: **stand up the scheduled board refresh** (GitHub Actions cron →
  `/api/cron/refresh` with `CRON_SECRET`) - unblocks the KV-dependent items below. Needs the
  secret set, so semi-auto.
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
4. **[DONE 2026-08-07 · d6e9772] Shareable market cards.** Per-market + site OG images
   (`app/market/[id]/opengraph-image.tsx`, `app/opengraph-image.tsx`, `next/og`). Market links
   now unfurl as a branded card carrying the odds. Verified on prod (1200x630 PNGs, per-market
   `og:image` + `twitter:image`); falls back to the site card for a 404/unknown id.
5. **[P2 · NEEDS-DATA] Track record / calibration - "was the crowd right?"** Snapshots vs
   realised outcomes over time. **Two prerequisites, not one:** (a) the scheduled refresh must
   actually run so snapshots accumulate (see the corrected KV note above - it isn't running),
   and (b) resolutions/outcomes aren't captured at all, so an outcome-capture step is needed.
6. **[P3 · NEEDS-SOURCE] Macro calendar tie-in.** Annotate what MOVED the odds (CPI, FOMC) so a
   jump carries its narrative. Needs an economic-calendar data feed.
7. **[P3 · SEMI-AUTO] Disagreement as the through-line.** Make crowd-vs-Fed / cross-venue
   disagreement the homepage hook, not a sub-page (overlay + cross-venue page already built).
   Buildable now, but the homepage layout is a taste call - show options first.

## Found 2026-08-26 (from the chart-legibility pass)

8. **[DONE 2026-08-26 · fe66bc0 + e8e44f1] Duplicate-looking timeline rows.** The
   original diagnosis below was WRONG on two counts, both corrected by enumerating every
   raw-vs-rendered title on the live board rather than reading the visible case:
   (a) the collisions are **cross-venue** (Kalshi vs Polymarket), not two Kalshi series,
   so deduping would have deleted the cross-venue spread this site exists to show;
   (b) the "Fed cuts rates before 2027" pair at 8%/13% was **not a duplicate at all** -
   one was "Fed emergency rate cut before 2027?" being mislabelled as the broad any-cut
   market. That hunt also found `>25bps` being dropped from 24 markets, which rendered
   "Fed hikes >25bps at the Sep 2026 meeting" as "Fed hikes at the Sep 2026 meeting".
   Resolution: fix both mislabellings, keep both rows, name the venue on the ones that
   still share a label. Residual logged as item 10.

10. **[P3 · AUTO] Open-ended buckets share a proposition key regardless of threshold.**
   `parseFedProposition` keys ">N bps" as `bps: -1` for any N, so a hypothetical ">25bps"
   and ">50bps" hike for the same meeting would cross-venue match each other. No such
   pair exists on the board today, which is why the key was left alone when the display
   was fixed (changing it moves cross-venue pairing and the distribution). Worth closing
   before either venue lists a second open-ended bucket.

~~8-old. The board carries the same proposition on more than one series.~~ Two
   Kalshi series can both ask "does the Fed hold in September", so the timeline shows
   genuine near-duplicates ("Fed cuts rates before 2027" at 8% and again at 13%, the same
   `displayTitle` from two tickers with different pricing). The movers panel now dedupes
   on `displayTitle` before its topN cut (commit 8d84cd2), but the timeline and the board
   do not, and `representativeByEvent` does not catch it because the pair sit under
   different events. Decide whether the right answer is a wider dedupe key, or showing
   both with the venue/series named so the difference reads as information rather than as
   a bug. NOTE this is real data, not a rendering fault: the two tickers really are priced
   apart, which is arguably the interesting bit.

9. **[P3 · AUTO] Give each top-movers row its 7-day sparkline.** `/api/movers` already
   fetches the full history series per market and then throws everything away except the
   net move, so the shape is free apart from payload size. A dumbbell says where it
   started and finished; a sparkline says whether it drifted or jumped, which is the
   question a mover actually raises. `components/charts/Sparkline.tsx` already exists and
   is used by the board. **Payload measured 03/09/2026, and it is not the obstacle the line
   above assumed:** sending `[iso, prob]` pairs costs +145% (2190 -> 5358 bytes), but a
   sparkline needs no dates - the points are evenly spaced daily - so a probabilities-only
   array costs ~650 bytes, +30% on a 2.2KB response. Negligible.

   **Recommendation: build it, probs-only.** The series is already fetched and discarded,
   `components/charts/Sparkline.tsx` already exists and is used by the board, and the
   dumbbell cannot distinguish a steady drift from a spike-and-retrace, which is the
   question a mover actually raises.

   **Not done unprompted because it adds a visual element to a panel**, and that is the
   class of change Charlie has rejected before (the per-row arrow on /research, the accent
   colour on Photocopy). **Default if he says nothing: leave it as is.** One word reopens
   it, and it is about an hour including a rendered before/after to look at.

11. **[DONE 2026-09-02 · 6f9dd6a + 3b309c3] SEO hygiene.** robots.txt and sitemap.xml
   both 404'd; all seven pages plus ~130 market pages shared one description; no
   metadataBase or canonicals. All fixed and verified live. Sitemap is capped at the top
   100 markets by volume, deliberately not all ~600, because templated near-identical
   pages at that scale read as auto-generated content and risk the subdomain.

12. **[DONE 2026-09-03 · 31e7479] /timeline exposed no crawlable market links.** Their rows
   navigate with `router.push` on a div/button rather than an anchor, so they contribute
   nothing to crawl discovery (`/` and `/value` carry 115 and 122 links). The sitemap now
   covers discovery, so this is cosmetic for SEO, but an anchor would also give those rows
   middle-click and open-in-new-tab, which they currently lack.
   DONE: both are `next/link` anchors now, and `role="img"` came off both containers
   because presenting 125 real links as one image hides them from a screen reader.
   /timeline went 0 -> 80 crawlable links live. **/map is still 0 and that is
   deliberate**: the movers list is fetched client-side so its links are not in the
   server HTML, and the treemap and scatter are recharts marks where an anchor is not
   practical. The sitemap already covers discovery there.

**On SEO generally (assessed 2026-09-02, worth re-reading before anyone starts an SEO
push):** Search Console showed 20 impressions and 0 clicks at average rank 14.4. Zero
clicks at rank 14 is the *predicted* outcome, not a finding, so there is no click-through
problem in that data. Crowdwise gets more impressions than the other projects mainly
because it has ~130 pages against their one. The queries it would target are held by the
venues themselves plus purpose-built SEO domains (defirate, coingape,
predictionmarketspicks, primerates), and the cross-venue angle is already occupied by
predictioncompare.com. A zero-authority subdomain does not take those positions with
on-page work. The growth plan at the top of this file (content flywheel + owned email)
remains the right bet; the work above is hygiene, not a strategy.

## Promotion (growth plan, not code)
- Daily macro chart on X/FinTwit (Fed-path-vs-crowd, or the widest cross-venue gap)
  linking back - the flywheel; the tool's own visuals are the marketing.
- Newsletter as the owned channel; Reddit (r/econmonitor, r/PredictionMarkets, r/finance);
  LinkedIn / the personal hub for the professional angle.

## Older backlog (pre-existing)
- **B8 [DONE] BoardTable click-sortable columns** - shipped (commit d6e9772), verified on prod.
- **[DONE] Valid market links occasionally 404** (commit b78549c). `fetchTopMarkets` returns a
  slightly different volume-ranked top-set per request and the market page found its market by
  filtering that set, so a link valid when generated could 404 later (and then serve the generic
  OG card). Fixed with `fetchMarketById` in `lib/sources.ts` - a deterministic per-venue lookup
  (Kalshi `/markets/<ticker>`, Polymarket gamma `condition_ids`) used as a fallback in the page,
  its `generateMetadata`, and the OG image route. NOT built on KV: there is **no `vercel.json`
  and no cron configured in prod**, so the KV board is not reliably populated - don't assume
  `boardStore` has data. Verified on prod: deep-in-the-list markets 200, bogus ids still 404.
- Non-Fed verbose titles (WTI oil strikes, jobs, GDP, geopolitics) left deliberately - no
  clean universal transform; only Fed titles are canonicalised (`displayTitle`). WON'T-DO.
- Dormant Metaculus integration (`lib/metaculus.ts`) - BLOCKED, revisit only if access opens.
- ~30 board rows show no trend sparkline: genuinely brand-new markets with <3 points of
  history even over 30d - BY DESIGN, don't "fix" by faking a line.
