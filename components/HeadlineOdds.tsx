import Link from "next/link";
import { pct, fmtVol } from "@/lib/format";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { HeadlineTile } from "@/lib/highlights";

// Big, shareable "market-implied odds" tiles - the home-page hero. The number
// stays neutral white (magnitude, not sentiment); the theme carries the colour.
export function HeadlineOdds({ tiles }: { tiles: HeadlineTile[] }) {
  if (!tiles.length) return null;
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.id}
          href={`/market/${encodeURIComponent(t.id)}`}
          className="group flex flex-col rounded-2xl border border-white/[0.06] bg-panel/60 p-4 transition-colors hover:border-white/15"
        >
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.06em] text-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: THEME_COLOURS[t.category] ?? "#4c9be8" }}
            />
            {t.category}
          </div>
          <div className="mt-3 text-[40px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[var(--text)]">
            {pct(t.prob, 0)}
          </div>
          <div className="mt-2 line-clamp-2 text-[13px] leading-snug text-muted group-hover:text-[var(--text)]">
            {t.title}
          </div>
          <div className="mt-2 text-[11px] text-[var(--muted-dim)]">
            {t.platform} · vol {fmtVol(t.volume)}
          </div>
        </Link>
      ))}
    </div>
  );
}
