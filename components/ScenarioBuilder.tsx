"use client";
import { useMemo, useState } from "react";
import { jointYes, atLeastOne } from "@/lib/scenario";
import { pct } from "@/lib/format";
import { LegBars } from "./charts/LegBars";
import { representativeByEvent } from "@/lib/board";
import type { Market } from "@/lib/types";

export function ScenarioBuilder({ markets }: { markets: Market[] }) {
  const options = useMemo(() => {
    const opts = representativeByEvent(markets).filter((r) => r.prob != null);
    opts.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    return opts.slice(0, 150);
  }, [markets]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const legs = options.filter((o) => picked.has(o.id));
  const toggle = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const probs = legs.map((l) => l.prob as number);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Scenario Builder</h1>
      <p className="mb-6 text-sm text-muted">
        Pick two or more markets to read the joint probability of all resolving YES, and of at least one.
        Both assume independence - real markets are often correlated, so treat these as bounds, not gospel.
      </p>
      {legs.length >= 2 && (
        <div className="mb-6 flex gap-8">
          <div><div className="text-xs text-muted">P(all resolve YES)</div><div className="text-2xl font-bold text-accent">{pct(jointYes(probs))}</div></div>
          <div><div className="text-xs text-muted">P(at least one)</div><div className="text-2xl font-bold text-accent">{pct(atLeastOne(probs))}</div></div>
        </div>
      )}
      {legs.length >= 2 && <div className="mb-6"><LegBars legs={legs} /></div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${picked.has(o.id) ? "border-accent" : "border-white/10"}`}>
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
            <span className="text-muted">[{o.category}]</span>
            <span className="flex-1">{o.title.slice(0, 80)}</span>
            <span className="tabular-nums text-muted">{pct(o.prob, 0)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
