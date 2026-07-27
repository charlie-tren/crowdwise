"use client";
import { useRouter } from "next/navigation";
import { THEME_COLOURS } from "@/lib/themeColours";
import { displayTitle } from "@/lib/highlights";
import type { Market } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function axisLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}
const TICKS = 5;

// A maturity ladder of priced macro risk: one named row per market, sorted by
// resolution date, its marker sitting on a shared time axis and carrying the
// implied probability. Reads left-to-right as a tenor ladder (the same mental
// model as a debt-maturity or rate-path chart) rather than a bubble cloud, and
// vertical stacking avoids the near-term pile-up that plagued the scatter.
export function TimelineLadder({ markets }: { markets: Market[] }) {
  const router = useRouter();
  const rows = markets
    .filter((m) => m.prob != null && m.endDate)
    .map((m) => ({ ...m, ms: new Date(`${m.endDate}T00:00:00Z`).getTime() }))
    .sort((a, b) => a.ms - b.ms);

  if (!rows.length) return <p className="text-sm text-muted">No dated markets match the selected themes.</p>;

  // Anchor the axis to the actual resolution dates (NOT Date.now()): every market
  // here is future-dated, and a Date.now() anchor differs by a few ms between the
  // SSR pass and client hydration, which shifts every marker's % and triggers a
  // hydration mismatch. Deriving the domain purely from props keeps them identical.
  const domainMin = Math.min(...rows.map((r) => r.ms));
  const domainMax = Math.max(...rows.map((r) => r.ms));
  const range = Math.max(domainMax - domainMin, 1);
  const posOf = (ms: number) => ((ms - domainMin) / range) * 100;

  const maxVol = Math.max(...rows.map((r) => r.volume || 0), 1);
  const dotPx = (vol: number) => 9 + 7 * Math.sqrt((vol || 0) / maxVol); // 9..16

  const ticks = Array.from({ length: TICKS }, (_, i) => domainMin + (range * i) / (TICKS - 1));

  return (
    <div role="img" aria-label="Maturity ladder of market resolution dates versus implied probability">
      {/* axis */}
      <div className="grid grid-cols-[130px_1fr] items-center border-b border-white/[0.06] pb-2 sm:grid-cols-[260px_1fr]">
        <div />
        <div className="relative h-4">
          {ticks.map((t, i) => {
            const mid = i !== 0 && i !== TICKS - 1;
            return (
              <span
                key={i}
                className={"absolute whitespace-nowrap text-[10.5px] text-[var(--muted-dim)] tabular-nums" + (mid ? " -translate-x-1/2" : "")}
                style={i === 0 ? { left: 0 } : i === TICKS - 1 ? { right: 0 } : { left: `${(i / (TICKS - 1)) * 100}%` }}
              >
                {axisLabel(t)}
              </span>
            );
          })}
        </div>
      </div>

      {/* rows */}
      {rows.map((r) => {
        const colour = THEME_COLOURS[r.category] ?? "#4c9be8";
        const pos = posOf(r.ms);
        const flip = pos > 60; // put label left of the dot near the right edge
        const size = dotPx(r.volume || 0);
        return (
          <div
            key={r.id}
            onClick={() => router.push("/market/" + encodeURIComponent(r.id))}
            className="grid cursor-pointer grid-cols-[130px_1fr] items-center border-b border-white/[0.06] py-1.5 transition-colors hover:bg-white/[0.02] sm:grid-cols-[260px_1fr]"
          >
            <div className="flex items-center gap-2 pr-3">
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: colour }} />
              <span className="truncate text-[12.5px] text-[var(--text)]">{displayTitle(r)}</span>
            </div>
            <div className="relative h-6">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.05]" />
              <div
                className={"absolute top-1/2 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap" + (flip ? " -translate-x-full flex-row-reverse" : "")}
                style={{ left: `${pos.toFixed(2)}%` }}
              >
                <span
                  className="flex-none rounded-full"
                  style={{ width: size, height: size, background: colour, boxShadow: `0 0 0 3px ${colour}22` }}
                />
                <span className="text-[12px] font-semibold tabular-nums text-[var(--text)]">
                  {((r.prob as number) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
