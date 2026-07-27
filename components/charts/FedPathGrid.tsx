import type { FedMeeting, FedOutcome } from "@/lib/highlights";

// Same semantic palette as the distribution bar: cuts blue, hold slate, hikes
// amber - no green/red traffic-light colour.
function segmentColour(o: FedOutcome): string {
  if (o.action === "hold") return "#64748b";
  if (o.action === "cut") return o.bps === 25 ? "#4c9be8" : "#3f79c0";
  return o.bps === 25 ? "#fbbf24" : "#f59e0b";
}

const LEGEND: Array<{ label: string; colour: string }> = [
  { label: "Cut", colour: "#4c9be8" },
  { label: "Hold", colour: "#64748b" },
  { label: "Hike", colour: "#fbbf24" },
];

export function FedPathGrid({ meetings }: { meetings: FedMeeting[] }) {
  if (meetings.length < 2) return null;
  return (
    <div>
      <div
        role="img"
        aria-label="Market-implied outcome distribution for each upcoming FOMC meeting"
        className="flex items-end gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {meetings.map((mtg) => {
          const denom = mtg.total > 0 ? mtg.total : 1;
          // top-to-bottom: hikes, hold, cuts (reverse of the cut->hold->hike sort)
          const stacked = [...mtg.outcomes].reverse();
          return (
            <div key={mtg.ym} className="flex min-w-[64px] flex-1 flex-col items-center gap-2">
              <div className="flex h-36 w-full flex-col overflow-hidden rounded-lg border border-white/[0.06]">
                {stacked.map((o) => {
                  // Height normalised to fill the column; label is the raw market
                  // price, consistent with the distribution bar and the tile.
                  const h = (o.prob / denom) * 100;
                  return (
                    <div
                      key={o.id}
                      title={`${mtg.label} · ${o.label}: ${(o.prob * 100).toFixed(0)}%`}
                      className="flex items-center justify-center overflow-hidden text-[10px] font-semibold text-[#0b0e17]"
                      style={{ height: `${h}%`, background: segmentColour(o) }}
                    >
                      {h >= 16 && <span className="tabular-nums">{(o.prob * 100).toFixed(0)}</span>}
                    </div>
                  );
                })}
              </div>
              <span className="whitespace-nowrap text-[11px] text-muted">{mtg.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: l.colour }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
