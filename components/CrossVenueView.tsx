import Link from "next/link";
import type { CSSProperties } from "react";
import { pct } from "@/lib/format";
import type { CrossVenuePair } from "@/lib/crossVenue";

const DIVERGENCE_NOTABLE = 0.05;

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
            const kx = pair.kalshiProb * 100;
            const px = pair.polymarketProb * 100;
            const spanLeft = Math.min(kx, px);
            const spanWidth = Math.abs(kx - px);
            const gapPp = pair.divergence * 100;
            const kalshiLower = pair.kalshiProb <= pair.polymarketProb;
            const lowerName = kalshiLower ? "Kalshi" : "Polymarket";
            const notable = pair.divergence >= DIVERGENCE_NOTABLE;
            // The lower-priced venue's flag sits above the track, the higher one below,
            // so the two labels never collide even when the ticks are close together.
            const flag = (name: string, x: number, above: boolean) => (
              <div
                className="absolute flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${x}%`, [above ? "bottom" : "top"]: "calc(50% + 12px)" } as CSSProperties}
              >
                {above ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wide text-muted">{name}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--text)]">{pct(x / 100)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--text)]">{pct(x / 100)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted">{name}</span>
                  </>
                )}
              </div>
            );
            return (
              <div key={pair.key} className="rounded-xl border border-white/[0.06] bg-panel/60 p-5">
                <span className="text-[15px] font-medium text-[var(--text)]">{pair.label}</span>

                {/* gap bar: both venues on one 0-100% probability track */}
                <div className="mt-9 mb-8">
                  <div className="relative mx-1 h-1.5">
                    <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded bg-white/[0.06]" />
                    <div
                      className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded"
                      style={{ left: `${spanLeft}%`, width: `${spanWidth}%`, background: "linear-gradient(90deg,rgba(76,155,232,.3),rgba(76,155,232,.6))" }}
                    />
                    <div className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-[var(--text)]" style={{ left: `${kx}%` }} />
                    <div className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-[var(--text)]" style={{ left: `${px}%` }} />
                    {flag("Kalshi", kx, kalshiLower)}
                    {flag("Polymarket", px, !kalshiLower)}
                  </div>
                  <div className="mt-1.5 flex justify-between px-0.5 text-[10px] text-[var(--muted-dim)]">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <span className={"tabular-nums font-semibold " + (notable ? "text-accent" : "text-[var(--text)]")}>
                    {gapPp.toFixed(1)}pp apart
                  </span>
                  <span>· {lowerName} prices it lower</span>
                </div>

                <p className="mt-3 text-[13px] text-[var(--muted-dim)]">
                  <Link href={`/market/${encodeURIComponent(pair.kalshi.id)}`} className="hover:text-[var(--text)] hover:underline">
                    {pair.kalshi.title}
                  </Link>
                  {" · "}
                  <Link href={`/market/${encodeURIComponent(pair.polymarket.id)}`} className="hover:text-[var(--text)] hover:underline">
                    {pair.polymarket.title}
                  </Link>
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
