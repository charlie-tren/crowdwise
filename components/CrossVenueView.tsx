import Link from "next/link";
import { pct } from "@/lib/format";
import type { CrossVenuePair } from "@/lib/crossVenue";

const DIVERGENCE_NOTABLE = 0.05;
const KALSHI_COLOUR = "#4c9be8";
const POLYMARKET_COLOUR = "#8ea2ff";

export function CrossVenueView({ pairs }: { pairs: CrossVenuePair[] }) {
  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Kalshi vs Polymarket</h1>
      <p className="mb-6 text-[13px] text-muted">
        Where both venues price the exact same outcome, side by side. The gap is how far the two venues
        disagree - not risk-free arbitrage; resolution terms, fees and settlement differ between platforms.
      </p>
      {pairs.length === 0 ? (
        <p className="text-[13px] text-muted">
          No matching propositions priced on both venues right now.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pairs.map((pair) => {
            const gapPp = pair.divergence * 100;
            const kalshiLower = pair.kalshiProb <= pair.polymarketProb;
            const lowerName = kalshiLower ? "Kalshi" : "Polymarket";
            const notable = pair.divergence >= DIVERGENCE_NOTABLE;
            // A comparable prob was computed as 1-quote when this side is a
            // negated market (see `Polarity` in lib/crossVenue.ts) - so the
            // percentage shown here can differ from what the venue itself
            // quotes. Flagging it here, the same terse way the Scenario Map
            // flags an inverted node ("NO side"), is what keeps a reader who
            // clicks through from finding a different number and losing trust
            // in the page.
            const bar = (name: string, id: string, prob: number, colour: string, inverted: boolean) => (
              <Link
                href={`/market/${encodeURIComponent(id)}`}
                className="group grid grid-cols-[86px_1fr_52px] items-center gap-3"
              >
                <span className="text-[13px] text-muted group-hover:text-[var(--text)]">
                  {name}
                  {inverted && <span className="ml-1 text-[11px] text-[var(--muted-dim)]">NO side</span>}
                </span>
                <span className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${(prob * 100).toFixed(1)}%`, background: colour }}
                  />
                </span>
                <span className="text-right text-[13px] font-semibold tabular-nums text-[var(--text)]">
                  {pct(prob)}
                </span>
              </Link>
            );
            return (
              <div key={pair.key} className="rounded-xl border border-white/[0.06] bg-panel/60 p-5">
                <span className="text-[15px] font-medium text-[var(--text)]">{pair.label}</span>

                {/* aligned probability bars, both venues on the same 0-100% scale */}
                <div className="mt-4 flex flex-col gap-3">
                  {bar("Kalshi", pair.kalshi.id, pair.kalshiProb, KALSHI_COLOUR, pair.kalshiInverted)}
                  {bar("Polymarket", pair.polymarket.id, pair.polymarketProb, POLYMARKET_COLOUR, pair.polymarketInverted)}
                </div>

                <div className="mt-3 flex items-center gap-2 text-[13px] text-muted">
                  <span className={"tabular-nums font-semibold " + (notable ? "text-accent" : "text-[var(--text)]")}>
                    {gapPp.toFixed(1)}pp apart
                  </span>
                  <span>· {lowerName} prices it lower</span>
                </div>

                <p className="mt-3 text-[13px] text-[var(--muted-dim)]">
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
