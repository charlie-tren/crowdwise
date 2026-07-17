"use client";
import { useMemo, useState } from "react";
import { jointYes, atLeastOne } from "@/lib/scenario";
import { pct } from "@/lib/format";
import { LegBars } from "./charts/LegBars";
import { representativeByEvent } from "@/lib/board";
import { CATEGORIES } from "@/lib/taxonomy";
import { ThemeChip } from "./ThemeChip";
import type { Market } from "@/lib/types";

const FOCUS_RING = "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function ScenarioBuilder({ markets }: { markets: Market[] }) {
  const allOptions = useMemo(() => {
    const opts = representativeByEvent(markets).filter((r) => r.prob != null);
    opts.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    return opts.slice(0, 150);
  }, [markets]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [themes, setThemes] = useState<Set<string>>(new Set(CATEGORIES));
  const [hideLongshots, setHideLongshots] = useState(true);

  const toggleTheme = (t: string) => {
    const next = new Set(themes);
    next.has(t) ? next.delete(t) : next.add(t);
    setThemes(next);
  };

  const legs = allOptions.filter((o) => picked.has(o.id));
  const toggle = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const q = search.trim().toLowerCase();
  const visibleOptions = useMemo(() => {
    return allOptions.filter((o) => {
      if (picked.has(o.id)) return true; // picked legs stay visible/selectable regardless of filters
      if (q && !o.title.toLowerCase().includes(q)) return false;
      if (!themes.has(o.category)) return false;
      if (hideLongshots && o.prob != null && (o.prob < 0.02 || o.prob > 0.98)) return false;
      return true;
    });
  }, [allOptions, picked, q, themes, hideLongshots]);

  const probs = legs.map((l) => l.prob as number);
  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Scenario Builder</h1>
      <p className="mb-6 text-sm text-muted">
        Pick two or more markets to read the joint probability of all resolving YES, and of at least one.
        Both assume independence - real markets are often correlated, so treat these as bounds, not gospel.
      </p>
      {legs.length >= 2 && (
        <div className="mb-6 flex gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-panel/60 p-4">
            <div className="text-[13px] text-muted">P(all resolve YES)</div>
            <div className="text-2xl font-semibold tabular-nums text-accent">{pct(jointYes(probs))}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-panel/60 p-4">
            <div className="text-[13px] text-muted">P(at least one)</div>
            <div className="text-2xl font-semibold tabular-nums text-accent">{pct(atLeastOne(probs))}</div>
          </div>
        </div>
      )}
      {legs.length >= 2 && <div className="mb-6"><LegBars legs={legs} /></div>}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((t) => <ThemeChip key={t} theme={t} active={themes.has(t)} onClick={() => toggleTheme(t)} />)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Search markets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-56 rounded-lg border border-white/10 bg-panel/40 px-3 py-1.5 text-sm placeholder:text-muted outline-none ${FOCUS_RING}`}
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={hideLongshots} onChange={(e) => setHideLongshots(e.target.checked)} />
            Hide longshots (&lt;2% or &gt;98%)
          </label>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleOptions.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
              picked.has(o.id) ? "border-accent bg-accent/[0.08]" : "border-white/[0.06]"
            }`}
          >
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
            <span className="text-[13px] text-muted">[{o.category}]</span>
            <span className="flex-1 text-[var(--text)]">{o.title.slice(0, 80)}</span>
            <span className="tabular-nums text-muted">{pct(o.prob, 0)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
