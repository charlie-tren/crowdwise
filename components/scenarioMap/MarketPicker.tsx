"use client";
import { useMemo, useState } from "react";
import { representativeByEvent } from "@/lib/board";
import { CATEGORIES } from "@/lib/taxonomy";
import { THEME_COLOURS } from "@/lib/themeColours";
import { pct, probFill } from "@/lib/format";
import { ThemeChip } from "@/components/ThemeChip";
import type { Market } from "@/lib/types";

const FOCUS_RING = "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

// Picking which of ~700 live markets becomes a node. Follows the deleted
// ScenarioBuilder's idioms (search box, theme chips, longshot filter, a row
// per market with a theme dot, a meter bar and its price) rather than
// inventing a second way of listing markets - see the commit that removed it
// for the precedent this reuses.
export function MarketPicker({
  markets, onPick, onClose,
}: {
  markets: Market[];
  onPick: (market: Market) => void;
  onClose: () => void;
}) {
  const options = useMemo(() => {
    const opts = representativeByEvent(markets).filter((m) => m.prob != null);
    opts.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    return opts;
  }, [markets]);

  const [search, setSearch] = useState("");
  const [themes, setThemes] = useState<Set<string>>(new Set(CATEGORIES));
  const [hideLongshots, setHideLongshots] = useState(true);

  const toggleTheme = (t: string) =>
    setThemes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    return options.filter((o) => {
      if (q && !o.title.toLowerCase().includes(q)) return false;
      if (!themes.has(o.category)) return false;
      if (hideLongshots && o.prob != null && (o.prob < 0.02 || o.prob > 0.98)) return false;
      return true;
    });
  }, [options, q, themes, hideLongshots]);

  return (
    <div className="mb-3 rounded-xl border border-white/[0.06] bg-panel/40 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          autoFocus
          placeholder="Search markets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`w-56 rounded-lg border border-white/10 bg-panel/40 px-3 py-1.5 text-sm placeholder:text-muted outline-none ${FOCUS_RING}`}
        />
        {CATEGORIES.map((t) => (
          <ThemeChip key={t} theme={t} active={themes.has(t)} onClick={() => toggleTheme(t)} />
        ))}
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={hideLongshots}
            onChange={(e) => setHideLongshots(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Hide longshots
        </label>
        <button
          onClick={onClose}
          className={`ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
        >
          Close
        </button>
      </div>
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {visible.map((o) => {
          const c = THEME_COLOURS[o.category] ?? "#4c9be8";
          return (
            <li key={o.id}>
              <button
                onClick={() => onPick(o)}
                className={`flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left text-sm transition-colors hover:border-white/20 hover:bg-white/[0.02] ${FOCUS_RING}`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[var(--text)]">{o.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.round((o.prob ?? 0) * 100)}%`, background: probFill(o.prob) }}
                    />
                  </span>
                  <span className="w-9 text-right tabular-nums text-muted">{pct(o.prob, 0)}</span>
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-2 py-4 text-center text-sm text-muted">No markets match the current filters.</li>
        )}
      </ul>
    </div>
  );
}
