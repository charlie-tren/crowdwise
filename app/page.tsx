import { BoardView } from "@/components/BoardView";
import { HeadlineOdds } from "@/components/HeadlineOdds";
import { FedDistributionBar, meetingLabel } from "@/components/charts/FedDistributionBar";
import { FedPathChart } from "@/components/charts/FedPathChart";
import { fetchTopMarkets } from "@/lib/board";
import { headlineOdds, fedDistribution, fedPath } from "@/lib/highlights";
import type { BoardPayload } from "@/lib/types";

// ISR: the rendered board is cached and regenerated at most every 5 minutes, so
// public traffic is served from cache rather than hitting the upstream APIs on
// every request. No external store (KV) or cron needed.
export const revalidate = 300;
export const maxDuration = 60;

async function getBoard(): Promise<BoardPayload> {
  const markets = await fetchTopMarkets();
  return { markets, moves: {}, fetchedAt: new Date().toISOString() };
}

export default async function HomePage() {
  const board = await getBoard();
  const tiles = headlineOdds(board.markets);
  const now = new Date();
  const todayYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const fed = fedDistribution(board.markets, todayYm);
  const path = fedPath(board.markets, todayYm);

  return (
    <>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Crowdwise</h1>
      <p className="mb-6 text-sm text-muted">
        The crowd&apos;s odds on macro events - live implied probabilities from the Kalshi and Polymarket prediction markets.
      </p>

      {board.markets.length === 0 ? (
        <p className="text-muted">No live markets right now - check back shortly.</p>
      ) : (
        <>
          <HeadlineOdds tiles={tiles} />

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
              <h2 className="mb-1 text-lg font-medium">Implied Fed path</h2>
              <p className="mb-3 text-sm text-muted">
                Market-implied cumulative rate change across upcoming meetings (bps vs today) - negative means
                easing is priced in.
              </p>
              <FedPathChart points={path} />
            </section>
          )}

          <BoardView initial={board} />
        </>
      )}
    </>
  );
}
