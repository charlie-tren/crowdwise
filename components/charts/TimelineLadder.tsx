"use client";
import Link from "next/link";
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
//
// Below `sm` the shared axis is dropped rather than squeezed: five date ticks
// collide inside a ~140px track, and a track that narrow puts every marker in
// the same place, so it costs the market names their room and returns nothing.
// The phone layout spends that width on the name and prints each row's own
// resolution date instead - the rows are still in date order either way.
export function TimelineLadder({ markets }: { markets: Market[] }) {
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

  // Kalshi and Polymarket both list some propositions, and once shortened the two
  // rows carry the same label at two different prices, which reads as a bug. It
  // is not: that gap is the cross-venue spread, and it is the thing this site
  // exists to show, so the rows stay and the venue is named on them instead. Only
  // the colliding ones get the tag - putting a venue on all 125 rows would be
  // noise to answer a question only these few raise.
  const labelCounts = new Map<string, number>();
  for (const r of rows) {
    const k = displayTitle(r);
    labelCounts.set(k, (labelCounts.get(k) ?? 0) + 1);
  }

  return (
    // Not role="img": the rows are real links now, and presenting the whole
    // ladder as a single image would hide every one of them from a screen reader.
    <div aria-label="Maturity ladder of market resolution dates versus implied probability">
      {/* axis - desktop only, see the note above */}
      <div className="hidden grid-cols-[minmax(0,26rem)_1fr] items-center border-b border-white/[0.06] pb-2 sm:grid">
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
        const pct = `${((r.prob as number) * 100).toFixed(0)}%`;
        const label = displayTitle(r);
        const shared = (labelCounts.get(label) ?? 0) > 1;
        return (
          // A real anchor, not a div with onClick. The row navigates either way,
          // but only an href gives middle-click, open-in-new-tab and copy-link -
          // and it is the only form a crawler can follow, which is why /timeline
          // contributed nothing to discovery.
          <Link
            key={r.id}
            href={`/market/${encodeURIComponent(r.id)}`}
            className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center border-b border-white/[0.06] py-1.5 transition-colors hover:bg-white/[0.02] sm:grid-cols-[minmax(0,26rem)_1fr]"
            title={r.title}
          >
            <div className="flex items-start gap-2 pr-3 sm:pr-4">
              <span className="mt-[5px] h-2 w-2 flex-none rounded-full" style={{ background: colour }} />
              {/* Wraps rather than truncating: a clipped question is not a market
                  the reader can name. Two lines is enough at the desktop column
                  width; on a phone the name takes whatever it needs. */}
              <span className="text-[12.5px] leading-snug text-[var(--text)] sm:line-clamp-2">
                {label}
                {shared && (
                  <span className="ml-1.5 whitespace-nowrap rounded border border-white/10 px-1 py-px align-[1px] text-[10px] text-[var(--muted-dim)]">
                    {r.platform}
                  </span>
                )}
              </span>
            </div>

            {/* phone: the row's own resolution date, no shared axis */}
            <div className="flex items-center gap-2 justify-self-end sm:hidden">
              <span className="text-[10.5px] tabular-nums text-[var(--muted-dim)]">{axisLabel(r.ms)}</span>
              <span
                className="flex-none rounded-full"
                style={{ width: size, height: size, background: colour, boxShadow: `0 0 0 3px ${colour}22` }}
              />
              <span className="w-9 text-right text-[12px] font-semibold tabular-nums text-[var(--text)]">{pct}</span>
            </div>

            {/* desktop: the marker on the shared time axis */}
            <div className="relative hidden h-6 sm:block">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.05]" />
              <div
                className={"absolute top-1/2 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap" + (flip ? " -translate-x-full flex-row-reverse" : "")}
                style={{ left: `${pos.toFixed(2)}%` }}
              >
                <span
                  className="flex-none rounded-full"
                  style={{ width: size, height: size, background: colour, boxShadow: `0 0 0 3px ${colour}22` }}
                />
                <span className="text-[12px] font-semibold tabular-nums text-[var(--text)]">{pct}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
