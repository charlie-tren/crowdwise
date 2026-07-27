"use client";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/taxonomy";
import { ThemeChip } from "./ThemeChip";
import { TimelineLadder } from "./charts/TimelineLadder";
import { representativeByEvent } from "@/lib/board";
import { daysTo } from "@/lib/format";
import type { Market } from "@/lib/types";

export function TimelineView({ markets }: { markets: Market[] }) {
  const [themes, setThemes] = useState<Set<string>>(new Set(["Rates/Fed"]));
  const toggle = (t: string) => { const n = new Set(themes); n.has(t) ? n.delete(t) : n.add(t); setThemes(n); };
  const pts = useMemo(() =>
    representativeByEvent(markets).filter((r) => themes.has(r.category) && r.prob != null && (daysTo(r.endDate) ?? -1) >= 0),
    [markets, themes]);
  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Timeline</h1>
      <p className="mb-4 text-sm text-muted">
        Term structure of priced macro risk: every market laid out by when it resolves, carrying its implied probability. Dot size = volume.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((t) => <ThemeChip key={t} theme={t} active={themes.has(t)} onClick={() => toggle(t)} />)}
      </div>
      <TimelineLadder markets={pts} />
      <p className="mt-2 text-[13px] text-muted">{pts.length} dated markets · sorted by resolution date · dot size ∝ volume · colour = theme.</p>
    </div>
  );
}
