import Link from "next/link";
import { probFill } from "@/lib/format";
import { formatThreshold, type StrikeLadder } from "@/lib/relativeValue";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function periodLabel(period: string): string {
  const [y, mo] = period.split("-");
  return mo ? `${MONTHS[Number(mo) - 1] ?? mo} ${y}` : y;
}

export function StrikeLadders({ ladders }: { ladders: StrikeLadder[] }) {
  if (!ladders.length) {
    return <p className="text-sm text-muted">No threshold ladders with enough rungs to compare right now.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {ladders.map((l) => {
        const cmp = l.direction === "above" ? ">" : "<";
        return (
          <div key={l.key} className="rounded-2xl border border-white/[0.06] bg-panel/60 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text)]">{l.metric}</h3>
                <div className="text-[12px] text-muted">{periodLabel(l.period)} · P(value {cmp} threshold)</div>
              </div>
              {l.hasViolation && (
                <span className="rounded bg-[#fbbf24]/15 px-2 py-0.5 text-[11px] font-medium text-[#fbbf24]">
                  inconsistency
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {l.rungs.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-muted">
                    {cmp} {formatThreshold(l.metric, r.threshold)}
                  </span>
                  <Link
                    href={`/market/${encodeURIComponent(r.id)}`}
                    title={r.title}
                    className="relative h-5 flex-1 overflow-hidden rounded bg-white/[0.04]"
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded"
                      style={{ width: `${Math.max(2, r.prob * 100)}%`, background: probFill(r.prob) }}
                    />
                  </Link>
                  <span
                    className={
                      "w-9 shrink-0 text-right text-[12px] tabular-nums " +
                      (r.violation ? "font-semibold text-[#fbbf24]" : "text-[var(--text)]")
                    }
                    title={r.violation ? "Priced richer than a lower threshold - a monotonicity violation" : undefined}
                  >
                    {(r.prob * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
