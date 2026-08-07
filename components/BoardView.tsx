"use client";
import { useEffect, useMemo, useState } from "react";
import { BoardFilters, type Filters } from "./BoardFilters";
import { BoardTable, type SortKey, type SortState } from "./BoardTable";
import { MarketCard } from "./MarketCard";
import { CATEGORIES } from "@/lib/taxonomy";
import { representativeByEvent, groupByWindow } from "@/lib/board";
import type { BoardPayload, Market } from "@/lib/types";

export function BoardView({ initial }: { initial: BoardPayload }) {
  const [view, setView] = useState<"table" | "cards">("table");
  const [spark, setSpark] = useState<{ sparks: Record<string, number[]>; moves: Record<string, number> } | null>(null);
  const [showLong, setShowLong] = useState(false);
  // Sort applies WITHIN each resolution window (windows stay the primary axis).
  // Default (key: null) keeps the volume-desc order groupByWindow produces.
  const [sort, setSort] = useState<SortState>({ key: null, dir: "desc" });
  const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = { prob: "desc", volume: "desc", resolves: "asc", move: "desc" };
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sparklines")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setSpark(data); })
      .catch(() => { /* sparklines are best-effort */ });
    return () => { cancelled = true; };
  }, []);

  const [filters, setFilters] = useState<Filters>({
    themes: new Set(CATEGORIES), platform: "All", search: "", probLo: 0, probHi: 100, headlineOnly: true,
  });

  const filtered = useMemo(() => {
    let rows: Market[] = filters.headlineOnly ? representativeByEvent(initial.markets) : [...initial.markets];
    rows = rows.filter((r) => filters.themes.has(r.category));
    if (filters.platform !== "All") rows = rows.filter((r) => r.platform === filters.platform);
    rows = rows.filter((r) => r.prob != null && r.prob * 100 >= filters.probLo && r.prob * 100 <= filters.probHi);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(s));
    }
    return rows;
  }, [initial.markets, filters]);

  // Window relative to the server-stamped fetch time (NOT Date.now()) so the SSR
  // and client hydration compute identical windows - avoids a hydration mismatch.
  const windows = useMemo(
    () => groupByWindow(filtered, new Date(initial.fetchedAt).getTime()),
    [filtered, initial.fetchedAt],
  );
  const moves = spark?.moves ?? initial.moves;
  const sparks = spark?.sparks;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {filtered.length} markets · grouped by when they resolve ·{" "}
          <span suppressHydrationWarning>updated {new Date(initial.fetchedAt).toLocaleString()}</span>
        </p>
        <div className="inline-flex shrink-0 rounded-lg border border-white/10 bg-panel/40 p-0.5 text-xs">
          {(["table", "cards"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 capitalize transition-colors ${view === v ? "bg-white/[0.08] text-[var(--text)]" : "text-muted hover:text-[var(--text)]"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-[13px] text-[var(--muted-dim)]">
        Near-term macro leads; long-dated markets sink to the bottom. Bar length = implied probability.
      </p>
      <BoardFilters filters={filters} setFilters={setFilters} />

      {windows.length === 0 && <p className="text-muted">No markets match the current filters.</p>}

      {windows.map((w) => {
        const collapsed = w.key === "long" && !showLong;
        return (
          <section key={w.key} className="mb-9">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">{w.label}</h2>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-muted">
                {w.markets.length}
              </span>
              <span className="hidden text-[12px] text-[var(--muted-dim)] sm:inline">{w.sublabel}</span>
              {w.key === "long" && (
                <button onClick={() => setShowLong((s) => !s)} className="ml-auto text-[12px] text-accent hover:underline">
                  {showLong ? "Hide" : `Show ${w.markets.length}`}
                </button>
              )}
            </div>
            {!collapsed && (view === "table" ? (
              <BoardTable markets={w.markets} moves={moves} sparks={sparks} sort={sort} onSort={toggleSort} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {w.markets.map((m) => (
                  <MarketCard key={m.id} m={m} move={moves[m.id]} spark={sparks?.[m.id]} />
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
