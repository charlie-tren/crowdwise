import { BoardView } from "@/components/BoardView";
import { fetchTopMarkets } from "@/lib/board";
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
