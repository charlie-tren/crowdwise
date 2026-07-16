"use client";
import { useMemo, useState } from "react";
import { BoardFilters, type Filters } from "./BoardFilters";
import { BoardTable } from "./BoardTable";
import { MarketCard } from "./MarketCard";
import { CATEGORIES } from "@/lib/taxonomy";
import { representativeByEvent, groupByCategory } from "@/lib/board";
import type { BoardPayload, Market } from "@/lib/types";

export function BoardView({ initial }: { initial: BoardPayload }) {
  const [view, setView] = useState<"cards" | "table">("cards");
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
    rows.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    return rows;
  }, [initial.markets, filters]);

  const grouped = useMemo(() => groupByCategory(filtered, 25), [filtered]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-muted">
          {filtered.length} markets · updated {new Date(initial.fetchedAt).toLocaleString()}
        </p>
        <button className="text-xs text-muted underline" onClick={() => setView(view === "cards" ? "table" : "cards")}>
          {view === "cards" ? "Table view" : "Card view"}
        </button>
      </div>
      <BoardFilters filters={filters} setFilters={setFilters} />
      {Object.keys(grouped).length === 0 && <p className="text-muted">No markets match the current filters.</p>}
      {Object.entries(grouped).map(([cat, members]) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">{cat} · {members.length}</h2>
          {view === "cards" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => <MarketCard key={m.id} m={m} move={initial.moves[m.id]} />)}
            </div>
          ) : (
            <BoardTable markets={members} moves={initial.moves} />
          )}
        </section>
      ))}
    </div>
  );
}
