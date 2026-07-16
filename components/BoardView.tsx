"use client";
import { useMemo, useState } from "react";
import { BoardFilters, type Filters } from "./BoardFilters";
import { BoardTable } from "./BoardTable";
import { MarketCard } from "./MarketCard";
import { CATEGORIES } from "@/lib/taxonomy";
import { representativeByEvent, groupByCategory } from "@/lib/board";
import type { BoardPayload, Market } from "@/lib/types";

type Sort = "volume" | "probability" | "soonest";

export function BoardView({ initial }: { initial: BoardPayload }) {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sort, setSort] = useState<Sort>("volume");
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
    if (sort === "probability") {
      rows.sort((a, b) => (b.prob ?? -1) - (a.prob ?? -1));
    } else if (sort === "soonest") {
      rows.sort((a, b) => {
        const da = a.endDate ? new Date(`${a.endDate}T00:00:00Z`).getTime() : NaN;
        const db = b.endDate ? new Date(`${b.endDate}T00:00:00Z`).getTime() : NaN;
        const aValid = !Number.isNaN(da), bValid = !Number.isNaN(db);
        if (aValid && bValid) return da - db;
        if (aValid) return -1;
        if (bValid) return 1;
        return 0;
      });
    } else {
      rows.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    }
    return rows;
  }, [initial.markets, filters, sort]);

  const grouped = useMemo(() => groupByCategory(filtered, 25), [filtered]);
  const totals = useMemo(() => groupByCategory(filtered), [filtered]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-muted">
          {filtered.length} markets · updated {new Date(initial.fetchedAt).toLocaleString()}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-white/10 bg-panel/40 px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="volume">Volume</option>
              <option value="probability">Probability</option>
              <option value="soonest">Soonest</option>
            </select>
          </label>
          <button className="text-xs text-muted underline" onClick={() => setView(view === "cards" ? "table" : "cards")}>
            {view === "cards" ? "Table view" : "Card view"}
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted">Bar length = implied probability.</p>
      <BoardFilters filters={filters} setFilters={setFilters} />
      {Object.keys(grouped).length === 0 && <p className="text-muted">No markets match the current filters.</p>}
      {Object.entries(grouped).map(([cat, members]) => {
        const total = totals[cat]?.length ?? members.length;
        return (
          <section key={cat} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-muted">
              {cat} · {total > members.length ? `${members.length} of ${total}` : total}
            </h2>
            {view === "cards" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((m) => <MarketCard key={m.id} m={m} move={initial.moves[m.id]} />)}
              </div>
            ) : (
              <BoardTable markets={members} moves={initial.moves} />
            )}
          </section>
        );
      })}
    </div>
  );
}
