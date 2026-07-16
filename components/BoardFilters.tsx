"use client";
import { CATEGORIES } from "@/lib/taxonomy";
import { ThemeChip } from "./ThemeChip";

export interface Filters { themes: Set<string>; platform: string; search: string; probLo: number; probHi: number; headlineOnly: boolean; }

const FOCUS_RING = "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function BoardFilters({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const toggleTheme = (t: string) => {
    const next = new Set(filters.themes);
    next.has(t) ? next.delete(t) : next.add(t);
    setFilters({ ...filters, themes: next });
  };
  const clampProb = (v: number) => Math.min(100, Math.max(0, Number.isNaN(v) ? 0 : v));
  const setProbLo = (v: number) => {
    const lo = clampProb(v);
    setFilters({ ...filters, probLo: lo, probHi: Math.max(lo, filters.probHi) });
  };
  const setProbHi = (v: number) => {
    const hi = clampProb(v);
    setFilters({ ...filters, probHi: hi, probLo: Math.min(hi, filters.probLo) });
  };
  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((t) => <ThemeChip key={t} theme={t} active={filters.themes.has(t)} onClick={() => toggleTheme(t)} />)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search markets…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className={`w-56 rounded-lg border border-white/10 bg-panel/40 px-3 py-1.5 text-sm placeholder:text-muted ${FOCUS_RING}`}
        />
        <select
          value={filters.platform}
          onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
          className={`rounded-lg border border-white/10 bg-panel/40 px-2 py-1.5 text-sm ${FOCUS_RING}`}
        >
          <option>All</option><option>Kalshi</option><option>Polymarket</option>
        </select>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>P %</span>
          <input
            type="number"
            min={0}
            max={100}
            value={filters.probLo}
            onChange={(e) => setProbLo(e.target.valueAsNumber)}
            aria-label="Minimum probability percent"
            className={`w-14 rounded-lg border border-white/10 bg-panel/40 px-2 py-1.5 text-sm ${FOCUS_RING}`}
          />
          <span>-</span>
          <input
            type="number"
            min={0}
            max={100}
            value={filters.probHi}
            onChange={(e) => setProbHi(e.target.valueAsNumber)}
            aria-label="Maximum probability percent"
            className={`w-14 rounded-lg border border-white/10 bg-panel/40 px-2 py-1.5 text-sm ${FOCUS_RING}`}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={filters.headlineOnly} onChange={(e) => setFilters({ ...filters, headlineOnly: e.target.checked })} />
          Headline per event
        </label>
      </div>
    </div>
  );
}
