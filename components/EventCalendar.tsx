import Link from "next/link";
import { fmtVol } from "@/lib/format";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { CalendarEvent } from "@/lib/calendar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string): { day: string; mon: string } {
  const [, m, d] = iso.split("-");
  return { day: String(Number(d)), mon: MONTHS[Number(m) - 1] ?? m };
}
function awayLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days}d`;
  const w = Math.round(days / 7);
  return `in ${w}w`;
}

// A forward agenda rail of upcoming market resolutions - scrolls horizontally.
export function EventCalendar({ events }: { events: CalendarEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {events.map((e) => {
        const { day, mon } = fmtDate(e.date);
        const colour = THEME_COLOURS[e.category] ?? "#4c9be8";
        return (
          <Link
            key={e.date}
            href={`/market/${encodeURIComponent(e.topId)}`}
            className="group flex w-44 shrink-0 flex-col rounded-xl border border-white/[0.06] bg-panel/60 p-3 transition-colors hover:border-white/15"
          >
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-semibold tabular-nums text-[var(--text)]">{day}</span>
                <span className="text-[13px] text-muted">{mon}</span>
              </div>
              <span className="text-[11px] text-[var(--muted-dim)]">{awayLabel(e.daysAway)}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: colour }} />
              {e.category}
            </div>
            <div className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted group-hover:text-[var(--text)]">
              {e.label}
            </div>
            <div className="mt-auto pt-2 text-[11px] text-[var(--muted-dim)]">
              {e.count > 1 ? `${e.count} markets · ` : ""}vol {fmtVol(e.volume)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
