import type { Market } from "./types";
import type { Category } from "./taxonomy";
import { displayTitle } from "./highlights";

export interface CalendarEvent {
  date: string;      // "YYYY-MM-DD"
  daysAway: number;  // whole days from today (>= 0)
  label: string;     // headline (highest-volume) market resolving that day
  category: Category;
  count: number;     // markets resolving that day
  volume: number;    // total volume resolving that day
  topId: string;     // id of the headline market (for click-through)
}

function dayDiff(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

// Cluster upcoming market resolutions by calendar day into a forward agenda:
// one entry per day something resolves, headlined by that day's biggest market,
// sorted soonest-first, limited to the next `limit` dated events. `todayISO`
// ("YYYY-MM-DD") is the reference day (injectable for tests).
export function buildEventCalendar(
  markets: Market[],
  todayISO: string,
  limit = 12,
): CalendarEvent[] {
  const byDay = new Map<string, Market[]>();
  for (const m of markets) {
    if (!m.endDate || m.prob == null) continue;
    const d = dayDiff(todayISO, m.endDate);
    if (Number.isNaN(d) || d < 0) continue; // only future/today resolutions
    const list = byDay.get(m.endDate);
    if (list) list.push(m);
    else byDay.set(m.endDate, [m]);
  }

  const events: CalendarEvent[] = [];
  for (const [date, ms] of byDay) {
    const top = ms.reduce((best, m) => (m.volume > best.volume ? m : best));
    events.push({
      date,
      daysAway: dayDiff(todayISO, date),
      label: displayTitle(top),
      category: top.category,
      count: ms.length,
      volume: ms.reduce((s, m) => s + (m.volume || 0), 0),
      topId: top.id,
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return events.slice(0, limit);
}
