"use client";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/taxonomy";
import { ThemeChip } from "./ThemeChip";
import { TimelineBubble } from "./charts/TimelineBubble";
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
      <h1 className="mb-1 text-2xl font-semibold">Timeline</h1>
      <p className="mb-4 text-sm text-muted">
        Term structure of priced macro risk: each market by resolution date (x) and implied probability (y), bubble size = volume.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((t) => <ThemeChip key={t} theme={t} active={themes.has(t)} onClick={() => toggle(t)} />)}
      </div>
      <TimelineBubble markets={pts} />
      <p className="mt-2 text-xs text-muted">{pts.length} dated markets · bubble size proportional to volume · colour = probability.</p>
    </div>
  );
}
