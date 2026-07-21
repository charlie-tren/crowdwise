"use client";
import { useMemo, useState } from "react";
import { jointYes, atLeastOne } from "@/lib/scenario";
import { pct, probFill } from "@/lib/format";
import { LegBars } from "./charts/LegBars";
import { representativeByEvent } from "@/lib/board";
import { CATEGORIES } from "@/lib/taxonomy";
import { THEME_COLOURS } from "@/lib/themeColours";
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
  const joint = jointYes(probs);
  const atLeast = atLeastOne(probs);
  const clearAll = () => setPicked(new Set());

  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Scenario Builder</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Pick two or more markets to read the joint probability of all resolving YES, and of at least one.
        Both assume independence - real markets are often correlated, so treat these as bounds, not gospel.
      </p>

      {/* Results */}
      {legs.length >= 2 ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            label="P(all resolve YES)"
            value={joint}
            hint={`All ${legs.length} legs resolve YES together`}
            colour="#4c9be8"
          />
          <StatTile
            label="P(at least one)"
            value={atLeast}
            hint={`One or more of the ${legs.length} legs resolves YES`}
            colour="#8ea2ff"
          />
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed border-white/[0.08] bg-panel/30 px-4 py-6 text-center text-sm text-muted">
          {legs.length === 1
            ? "One leg selected - pick at least one more to compute a joint probability."
            : "Select two or more markets below to build a scenario."}
        </div>
      )}

      {/* Selected legs summary */}
      {legs.length >= 1 && (
        <div className="mb-6 rounded-xl border border-white/[0.06] bg-panel/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-medium text-[var(--text)]">
              Selected legs <span className="text-muted">· {legs.length}</span>
            </div>
            <button
              onClick={clearAll}
              className={`rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {legs.map((l) => {
              const c = THEME_COLOURS[l.category] ?? "#4c9be8";
              return (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-panel/70 py-1 pl-2.5 pr-1.5 text-[12px]"
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                  <span className="max-w-[220px] truncate text-[var(--text)]">{l.title}</span>
                  <span className="tabular-nums text-muted">{pct(l.prob, 0)}</span>
                  <button
                    onClick={() => toggle(l.id)}
                    aria-label={`Remove ${l.title}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-[var(--text)]"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          {legs.length >= 2 && (
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <LegBars legs={legs} />
            </div>
          )}
        </div>
      )}

      {/* Filters */}
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
            <input
              type="checkbox"
              checked={hideLongshots}
              onChange={(e) => setHideLongshots(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Hide longshots (&lt;2% or &gt;98%)
          </label>
          <span className="ml-auto text-xs text-muted">
            {visibleOptions.length} market{visibleOptions.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Market picker */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleOptions.map((o) => {
          const on = picked.has(o.id);
          const c = THEME_COLOURS[o.category] ?? "#4c9be8";
          return (
            <label
              key={o.id}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                on ? "border-accent bg-accent/[0.08]" : "border-white/[0.06] hover:border-white/20 hover:bg-white/[0.02]"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(o.id)}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: c }}
                title={o.category}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[var(--text)]">{o.title.slice(0, 80)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.round((o.prob ?? 0) * 100)}%`, background: probFill(o.prob) }}
                  />
                </span>
                <span className="w-9 text-right tabular-nums text-muted">{pct(o.prob, 0)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, colour }: { label: string; value: number; hint: string; colour: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-panel/60 p-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-4xl font-semibold tabular-nums tracking-[-0.02em]" style={{ color: colour }}>{pct(value)}</div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(1, Math.round(value * 100))}%`, background: colour }}
        />
      </div>
      <div className="mt-2 text-[11px] text-muted">{hint}</div>
    </div>
  );
}
