import type { CentralBankRow } from "@/lib/centralBanks";

// Amber for hikes, the same semantics as FedPathGrid, so a reader arriving from
// that panel does not have to learn a second colour scheme.
const HIKE = "#fbbf24";
const TRACK = "rgba(255,255,255,0.06)";

function volume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function bps(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}bp`;
}

export function CentralBankGrid({ rows }: { rows: CentralBankRow[] }) {
  if (rows.length < 2) return null;
  const withFutures = rows.filter((r) => r.futuresBps !== null);
  const sources = Array.from(
    new Set(withFutures.map((r) => r.futuresSource).filter(Boolean) as string[]),
  );

  return (
    <div>
      <div
        role="img"
        aria-label="Market-implied chance of a rate rise before 2027, by central bank"
        className="flex flex-col gap-2"
      >
        {rows.map((r) => (
          <div key={r.code} className="flex items-center gap-3">
            <span className="w-[168px] shrink-0 truncate text-[13px]" title={r.bank}>
              {r.bank}
            </span>

            <div
              className="relative h-5 flex-1 overflow-hidden rounded"
              style={{ background: TRACK }}
            >
              <div
                className="h-full"
                style={{ width: `${Math.round(r.prob * 100)}%`, background: HIKE }}
                title={`${r.bank}: ${(r.prob * 100).toFixed(0)}% priced for a rise before 2027`}
              />
            </div>

            <span className="w-[42px] shrink-0 text-right text-[13px] font-semibold tabular-nums">
              {(r.prob * 100).toFixed(0)}%
            </span>

            {/* Futures get their own column and their own unit. A curve is not a
                probability, so it is never rendered as one. */}
            <span
              className="w-[76px] shrink-0 text-right text-[12px] tabular-nums text-muted"
              title={
                r.futuresBps === null
                  ? "No free futures curve for this bank"
                  : `${r.futuresSource}: ${bps(r.futuresBps)} priced by end-2026`
              }
            >
              {r.futuresBps === null ? "-" : bps(r.futuresBps)}
            </span>

            <span className="w-[46px] shrink-0 text-right text-[11px] tabular-nums text-muted">
              {volume(r.volume)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: HIKE }}
          />
          Crowd: chance of a rise before 2027
        </span>
        <span>Futures: basis points priced by end-2026</span>
        <span>Right: market volume</span>
      </div>

      <p className="mt-2 text-[12px] text-muted">
        The two columns are different units. A probability answers whether any rise
        happens; a curve prices how much. Where the curve has a full rise in and the
        crowd does not, they disagree.
        {sources.length > 0 && ` Futures from ${sources.join(" and ")}.`}
        {withFutures.length < rows.length &&
          ` The other ${rows.length - withFutures.length} have no free curve and show the crowd only.`}
      </p>
    </div>
  );
}
