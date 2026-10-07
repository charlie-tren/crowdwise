import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { BoardView } from "@/components/BoardView";
import { HeadlineOdds } from "@/components/HeadlineOdds";
import { EventCalendar } from "@/components/EventCalendar";
import { FedDistributionBar, meetingLabel } from "@/components/charts/FedDistributionBar";
import { centralBankRows, fedBpsPricedBy } from "@/lib/centralBanks";
import { fetchAsxPath, bpsPricedBy } from "@/lib/asxFutures";
import { FedPathChart } from "@/components/charts/FedPathChart";
import { FedPathGrid } from "@/components/charts/FedPathGrid";
import { FedPathOverlay } from "@/components/charts/FedPathOverlay";
import { CentralBankGrid } from "@/components/charts/CentralBankGrid";
import { fetchTopMarkets } from "@/lib/board";
import { headlineOdds, fedHeadlineTile, fedDistribution, fedPath, fedMeetingGrid } from "@/lib/highlights";
import { fetchFedFuturesPath, buildOverlaySeries } from "@/lib/fedFutures";
import { buildEventCalendar } from "@/lib/calendar";
import { buildSparklines } from "@/lib/sparklines";
import { fetchKalshiMarketHistory, fetchPolymarketMarketHistory } from "@/lib/sources";
import type { BoardPayload, Market } from "@/lib/types";

/* The home page's description TAG is written for search and AI answer engines
   and never shown to a reader (07/10/2026). og and twitter keep the visible lede,
   so a shared link still says what the page says. Set here, not in the root
   layout, so no other page inherits this og line. */
const LEDE = "Live odds on macro events - Fed decisions, inflation, recessions - from Kalshi and Polymarket.";
export const metadata: Metadata = {
  description:
    "Fed rate odds from prediction markets: the chance of a cut, hold or hike at each upcoming FOMC meeting, priced on Kalshi, plus live Kalshi and Polymarket odds on US recession, inflation and oil.",
  openGraph: { title: "Crowdwise", description: LEDE },
  twitter: { card: "summary_large_image", title: "Crowdwise", description: LEDE },
};

// ISR: the rendered board is cached and regenerated at most every 5 minutes, so
// public traffic is served from cache rather than hitting the upstream APIs on
// every request. No external store (KV) or cron needed.
export const revalidate = 300;
export const maxDuration = 60;

// The Atlanta Fed workbook is fetched with `cache: "no-store"` (it is >2 MB, over
// Next's per-item data-cache limit). An uncached fetch on the render path opts the
// WHOLE route out of static generation, which made `/` the only dynamic page on the
// site: every visit re-ran the board fetch, the 2 MB download and the sparklines,
// and <Link> could not prefetch it, so clicking the logo took seconds. Wrapping the
// call in its own cache scope keeps the download off the route's dynamic tracking
// and caches the tiny PARSED result instead. The Fed updates the file daily.
const cachedFedFuturesPath = unstable_cache(
  () => fetchFedFuturesPath(),
  ["atlanta-fed-mpt-path"],
  { revalidate: 21_600, tags: ["fed-futures"] },
);

async function getBoard(): Promise<BoardPayload> {
  const markets = await fetchTopMarkets();
  return { markets, moves: {}, fetchedAt: new Date().toISOString() };
}

export default async function HomePage() {
  const board = await getBoard();
  const tiles = headlineOdds(board.markets);
  const now = new Date();
  const todayYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const todayISO = now.toISOString().slice(0, 10);
  const fed = fedDistribution(board.markets, todayYm);
  // Keep the Rates/Fed tile consistent with the Fed distribution below it (both
  // Kalshi-sourced) rather than an arbitrary highest-volume cross-venue market.
  const fedTile = fedHeadlineTile(fed, board.markets);
  if (fedTile) {
    const i = tiles.findIndex((t) => t.category === "Rates/Fed");
    if (i >= 0) tiles[i] = fedTile;
    else tiles.unshift(fedTile);
  }
  const path = fedPath(board.markets, todayYm);
  const grid = fedMeetingGrid(board.markets, todayYm);
  const events = buildEventCalendar(board.markets, todayISO);

  // OIS/SOFR futures-implied path (Atlanta Fed) to overlay against the crowd path.
  // Best-effort: null (fetch/parse failure) falls back to the crowd-only chart.
  const fedFutures = path.length >= 2 ? await cachedFedFuturesPath() : null;
  const overlay = fedFutures ? buildOverlaySeries(fedFutures, path, now.getTime()) : [];

  // Central banks: the crowd's odds of a rise before 2027 for seven banks, beside
  // a real-money comparator where a free curve exists. Only the Fed and the RBA
  // have one; the other five render crowd-only rather than borrowing a number.
  // Best-effort like the Fed overlay - a failed ASX fetch drops one comparator,
  // not the panel.
  const asx = await fetchAsxPath();
  const cbComparators = { bps: {} as Record<string, number>,
                          source: {} as Record<string, string> };
  const asxBps = asx ? bpsPricedBy(asx, "2026-12-31") : null;
  if (asxBps !== null) {
    cbComparators.bps.RBA = asxBps;
    cbComparators.source.RBA = "ASX 30-day interbank futures";
  }
  const fedBps = fedFutures ? fedBpsPricedBy(fedFutures, "2026-12-31") : null;
  if (fedBps !== null) {
    cbComparators.bps.FED = fedBps;
    cbComparators.source.FED = "Atlanta Fed / CME";
  }
  const cbRows = centralBankRows(board.markets, cbComparators);

  // 7-day trend for the headline tiles (bounded: only the ~4 tile markets).
  const tileIds = new Set(tiles.map((t) => t.id));
  const tileMarkets = board.markets.filter((m) => tileIds.has(m.id));
  const tileHist = await buildSparklines(tileMarkets, (m: Market) =>
    m.platform === "Polymarket"
      ? fetchPolymarketMarketHistory(m.clobTokenId ?? "", { days: 7, fidelity: 60 })
      : fetchKalshiMarketHistory(m.series, m.id, { days: 7, periodInterval: 60 }),
  );

  return (
    <>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Crowdwise</h1>
      <p className="mb-6 text-sm text-muted">
        Live odds on macro events - Fed decisions, inflation, recessions - from Kalshi and Polymarket.
      </p>

      {board.markets.length === 0 ? (
        <p className="text-muted">No live markets right now - check back shortly.</p>
      ) : (
        <>
          <HeadlineOdds tiles={tiles} moves={tileHist.moves} sparks={tileHist.sparks} />

          {fed && (
            <section className="mb-8">
              <h2 className="mb-1 text-lg font-medium">Next Fed decision - {meetingLabel(fed.ym)}</h2>
              <p className="mb-3 text-sm text-muted">
                Market-implied odds across the possible FOMC outcomes.
              </p>
              <FedDistributionBar dist={fed} />
            </section>
          )}

          {path.length >= 2 && (
            <section className="mb-8">
              <h2 className="mb-1 text-lg font-medium">
                {overlay.length >= 2 ? "Fed path: futures vs the crowd" : "Implied Fed path"}
              </h2>
              <p className="mb-3 text-sm text-muted">
                {overlay.length >= 2
                  ? "Where the futures market (OIS/SOFR) and the prediction-market crowd each price the policy rate heading - a gap between the two is the disagreement."
                  : "Market-implied cumulative rate change across upcoming meetings (bps vs today) - negative means easing is priced in."}
              </p>
              {overlay.length >= 2 && fedFutures ? (
                <FedPathOverlay rows={overlay} asOf={fedFutures.asOf} />
              ) : (
                <FedPathChart points={path} />
              )}
            </section>
          )}

          {grid.length >= 2 && (
            <section className="mb-8">
              <h2 className="mb-1 text-lg font-medium">Outcome by meeting</h2>
              <p className="mb-3 text-sm text-muted">
                The full outcome distribution priced for each upcoming FOMC meeting.
              </p>
              <FedPathGrid meetings={grid} />
            </section>
          )}

          {cbRows.length >= 2 && (
            <section className="mb-8">
              <h2 className="mb-1 text-lg font-medium">Central banks: the crowd vs the curve</h2>
              <p className="mb-3 text-sm text-muted">
                The chance each central bank raises before 2027, against what its own
                futures curve has priced. Kalshi lists one binary per bank and no
                meeting-by-meeting ladder outside the Fed, so this is the same
                comparison the chart above makes, cut across banks rather than time.
              </p>
              <CentralBankGrid rows={cbRows} />
            </section>
          )}

          {events.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-1 text-lg font-medium">Upcoming resolutions</h2>
              <p className="mb-3 text-sm text-muted">
                When the biggest markets settle - the macro calendar the crowd is watching.
              </p>
              <EventCalendar events={events} />
            </section>
          )}

          <BoardView initial={board} />
        </>
      )}
    </>
  );
}
