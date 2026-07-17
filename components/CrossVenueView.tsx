import Link from "next/link";
import { pct } from "@/lib/format";
import type { CrossVenuePair } from "@/lib/crossVenue";

const DIVERGENCE_NOTABLE = 0.05;

export function CrossVenueView({ pairs }: { pairs: CrossVenuePair[] }) {
  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Cross-Venue Prices</h1>
      <p className="mb-6 text-[13px] text-muted">
        Where Kalshi and Polymarket price the same Fed-decision outcome, side by side. Divergence is how far the
        two venues disagree - not risk-free arbitrage; resolution terms, fees and settlement differ between
        platforms.
      </p>
      {pairs.length === 0 ? (
        <p className="text-[13px] text-muted">
          No overlapping Fed-decision markets priced on both venues right now.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pairs.map((pair) => {
            const notable = pair.divergence >= DIVERGENCE_NOTABLE;
            return (
              <div
                key={`${pair.ym}|${pair.action}|${pair.bps}`}
                className="rounded-xl border border-white/[0.06] bg-panel/60 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[15px] font-medium text-[var(--text)]">{pair.label}</span>
                  <div className="text-right">
                    <div
                      className={
                        "tabular-nums " +
                        (notable ? "text-xl font-semibold text-accent" : "text-[15px] text-muted")
                      }
                    >
                      {(pair.divergence * 100).toFixed(1)}pp
                    </div>
                    <div className="text-[13px] text-muted">divergence</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Link
                    href={`/market/${encodeURIComponent(pair.kalshi.id)}`}
                    className="flex flex-col gap-0.5 hover:underline"
                  >
                    <span className="text-[13px] text-muted">Kalshi</span>
                    <span className="text-xl font-semibold tabular-nums text-[var(--text)]">
                      {pct(pair.kalshiProb)}
                    </span>
                  </Link>
                  <Link
                    href={`/market/${encodeURIComponent(pair.polymarket.id)}`}
                    className="flex flex-col gap-0.5 hover:underline"
                  >
                    <span className="text-[13px] text-muted">Polymarket</span>
                    <span className="text-xl font-semibold tabular-nums text-[var(--text)]">
                      {pct(pair.polymarketProb)}
                    </span>
                  </Link>
                </div>
                <p className="mt-3 text-[13px] text-muted">
                  {pair.kalshi.title} · {pair.polymarket.title}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-[13px] text-[var(--muted-dim)]">
        Fed rate decisions only. For information only - not financial advice.
      </p>
    </div>
  );
}
