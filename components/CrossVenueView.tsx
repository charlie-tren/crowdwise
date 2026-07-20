import Link from "next/link";
import { pct } from "@/lib/format";
import type { CrossVenuePair } from "@/lib/crossVenue";

const DIVERGENCE_NOTABLE = 0.05;

export function CrossVenueView({ pairs }: { pairs: CrossVenuePair[] }) {
  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Kalshi vs Polymarket</h1>
      <p className="mb-6 text-[13px] text-muted">
        Where both venues price the exact same outcome, side by side. Divergence is how far the two venues
        disagree - not risk-free arbitrage; resolution terms, fees and settlement differ between platforms.
      </p>
      {pairs.length === 0 ? (
        <p className="text-[13px] text-muted">
          No matching propositions priced on both venues right now.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pairs.map((pair) => {
            const notable = pair.divergence >= DIVERGENCE_NOTABLE;
            const kalshiCheaper = pair.kalshiProb <= pair.polymarketProb;
            const cheaperName = kalshiCheaper ? "Kalshi" : "Polymarket";
            const cheaperProb = kalshiCheaper ? pair.kalshiProb : pair.polymarketProb;
            const dearerName = kalshiCheaper ? "Polymarket" : "Kalshi";
            const dearerProb = kalshiCheaper ? pair.polymarketProb : pair.kalshiProb;
            return (
              <div
                key={pair.key}
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
                {pair.divergence >= 0.005 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[13px]">
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
                      YES cheaper on {cheaperName}
                    </span>
                    <span className="text-muted">
                      {cheaperName} {pct(cheaperProb)} vs {dearerName} {pct(dearerProb)} - {(pair.divergence * 100).toFixed(1)}pp gap
                    </span>
                  </div>
                )}
                <p className="mt-3 text-[13px] text-muted">
                  {pair.kalshi.title} · {pair.polymarket.title}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-[13px] text-[var(--muted-dim)]">
        Matched on identical outcomes (Fed decisions, recession) only. For information only - not financial advice.
      </p>
    </div>
  );
}
