import Link from "next/link";
import { pct, fmtVol, daysTo, probFill } from "@/lib/format";
import { THEME_COLOURS } from "@/lib/themeColours";
import { displayTitle } from "@/lib/highlights";
import { Sparkline } from "./charts/Sparkline";
import type { Market } from "@/lib/types";

// Compact human resolution horizon.
function horizon(m: Market): string {
  const d = daysTo(m.endDate);
  if (d == null) return "—";
  if (d < 0) return "ended";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 31) return `in ${d}d`;
  if (d <= 365) return `in ${Math.round(d / 7)}w`;
  return `in ${Math.round(d / 30)}mo`;
}

// Dense, scannable table: one row per market (theme chip, title + venue, a blue
// probability meter, volume, resolution horizon, 30d trend). Probability uses the
// single-hue blue magnitude ramp; green/red is reserved for trend direction only.
export function BoardTable({
  markets, moves, sparks,
}: {
  markets: Market[];
  moves: Record<string, number>;
  sparks?: Record<string, number[]>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--muted-dim)]">
            <th scope="col" className="py-2 pr-3 font-medium">Theme</th>
            <th scope="col" className="py-2 pr-3 font-medium">Market</th>
            <th scope="col" className="py-2 pr-3 font-medium">Probability</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Volume</th>
            <th scope="col" className="py-2 pr-3 font-medium">Resolves</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">30d</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => {
            const mv = moves[m.id];
            const sp = sparks?.[m.id];
            const colour = THEME_COLOURS[m.category] ?? "#4c9be8";
            const showMove = mv != null && Math.abs(mv) >= 0.001;
            return (
              <tr key={m.id} className="group border-t border-white/[0.06] hover:bg-white/[0.02]">
                <td className="py-2.5 pr-3 align-middle">
                  <span
                    className="inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: colour, background: `${colour}1a` }}
                  >
                    {m.category}
                  </span>
                </td>
                <td className="py-2.5 pr-3 align-middle">
                  <Link
                    href={`/market/${encodeURIComponent(m.id)}`}
                    className="block max-w-[44ch] truncate text-[var(--text)] group-hover:text-accent"
                    title={displayTitle(m)}
                  >
                    {displayTitle(m)}
                  </Link>
                  <span className="text-[11px] text-[var(--muted-dim)]">{m.platform}</span>
                </td>
                <td className="py-2.5 pr-3 align-middle">
                  <div className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-right font-semibold tabular-nums text-[var(--text)]">
                      {pct(m.prob, 0)}
                    </span>
                    <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(m.prob ?? 0) * 100}%`, background: probFill(m.prob) }}
                      />
                    </span>
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right align-middle tabular-nums text-muted">{fmtVol(m.volume)}</td>
                <td className="py-2.5 pr-3 align-middle">
                  <span className="whitespace-nowrap rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-muted">
                    {horizon(m)}
                  </span>
                </td>
                <td className="py-2.5 pr-3 align-middle">
                  <div className="flex items-center justify-end gap-2">
                    {sp && sp.length >= 2 && <Sparkline values={sp} />}
                    <span
                      className="w-11 text-right tabular-nums text-[13px]"
                      style={{ color: !showMove ? "var(--muted-dim)" : (mv as number) >= 0 ? "#3fb27f" : "#e0714f" }}
                    >
                      {!showMove ? "—" : `${(mv as number) >= 0 ? "+" : ""}${((mv as number) * 100).toFixed(1)}`}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
