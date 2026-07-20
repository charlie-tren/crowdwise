import Link from "next/link";
import type { FedDistribution, FedOutcome } from "@/lib/highlights";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function meetingLabel(ym: string): string {
  const [y, mo] = ym.split("-");
  const idx = Number(mo) - 1;
  return `${MONTHS[idx] ?? mo} ${y}`;
}

// Cuts in blue (deeper cut = deeper blue), hold neutral slate, hikes in amber -
// semantic grouping without any green/red traffic-light colour.
function segmentColour(o: FedOutcome): string {
  if (o.action === "hold") return "#64748b";
  if (o.action === "cut") return o.bps === 25 ? "#4c9be8" : "#3f79c0";
  return o.bps === 25 ? "#fbbf24" : "#f59e0b";
}

export function FedDistributionBar({ dist }: { dist: FedDistribution }) {
  const denom = dist.total > 0 ? dist.total : 1;
  return (
    <div>
      <div
        role="img"
        aria-label={`Market-implied distribution of Fed outcomes for the ${meetingLabel(dist.ym)} meeting`}
        className="flex h-11 w-full overflow-hidden rounded-lg border border-white/[0.06]"
      >
        {dist.outcomes.map((o) => {
          const w = (o.prob / denom) * 100;
          const wide = w >= 9;
          return (
            <Link
              key={o.id}
              href={`/market/${encodeURIComponent(o.id)}`}
              title={`${o.label}: ${(o.prob * 100).toFixed(0)}%`}
              className="flex items-center justify-center overflow-hidden text-[12px] font-semibold text-[#0b0e17] transition-opacity hover:opacity-90"
              style={{ width: `${w}%`, background: segmentColour(o) }}
            >
              {wide && <span className="truncate px-1 tabular-nums">{(o.prob / denom * 100).toFixed(0)}%</span>}
            </Link>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
        {dist.outcomes.map((o) => (
          <span key={o.id} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: segmentColour(o) }} />
            {o.label}
            <span className="tabular-nums text-[var(--text)]">{(o.prob / denom * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export { meetingLabel };
