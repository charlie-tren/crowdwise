"use client";
import { useEffect, useMemo, useState } from "react";
import { representativeByEvent } from "@/lib/board";
import { buildTreemap, buildScatter } from "@/lib/mapData";
import { MarketTreemap } from "./charts/MarketTreemap";
import { ConvictionScatter } from "./charts/ConvictionScatter";
import { MoversSlope, type MoverBar, type SlopeMover } from "./charts/MoversSlope";
import { UncertaintyGauge } from "./UncertaintyGauge";
import { displayTitle } from "@/lib/highlights";
import type { Market } from "@/lib/types";

const TREEMAP_LIMIT = 45;

export function MarketMapView({ markets }: { markets: Market[] }) {
  const reps = useMemo(() => representativeByEvent(markets), [markets]);
  const treemapData = useMemo(() => buildTreemap(reps, TREEMAP_LIMIT), [reps]);
  const scatterData = useMemo(() => buildScatter(reps), [reps]);
  const [movers, setMovers] = useState<MoverBar[] | null>(null);

  // The live board keyed by id: each mover takes its "now" (was = now - move) and
  // its label from there, so the row carries the same shortened Fed wording the
  // timeline and tiles use rather than the raw venue question.
  const byId = useMemo(() => {
    const map = new Map<string, Market>();
    for (const m of markets) map.set(m.id, m);
    return map;
  }, [markets]);

  const slopeMovers = useMemo<SlopeMover[] | null>(() => {
    if (movers === null) return null;
    // The board carries the same proposition on more than one Kalshi series, and
    // displayTitle collapses those to one label - so without this the chart shows
    // "Fed holds at the Sep 2026 meeting" twice with two slightly different moves,
    // which reads as a bug. Movers arrive sorted by size, so the first wins.
    const seen = new Set<string>();
    return movers.flatMap((mv) => {
      const live = byId.get(mv.id);
      if (!live || live.prob == null) return [];
      const title = displayTitle(live);
      if (seen.has(title)) return [];
      seen.add(title);
      return [{ ...mv, title, now: live.prob }];
    });
  }, [movers, byId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/movers")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setMovers(data.movers ?? []); })
      .catch(() => { if (!cancelled) setMovers([]); });
    return () => { cancelled = true; };
  }, []);

  if (!reps.length) {
    return (
      <div>
        <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Market Map</h1>
        <p className="text-sm text-muted">No markets to map.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Market Map</h1>
      <p className="mb-4 text-sm text-muted">
        Two views of where volume and conviction sit across the board - biggest markets by size, and where the
        crowd is genuinely undecided.
      </p>

      <UncertaintyGauge markets={markets} />

      <h2 className="mb-1 text-lg font-medium">Biggest markets by volume</h2>
      <p className="mb-3 text-sm text-muted">
        The largest markets by volume (top {TREEMAP_LIMIT}), grouped by theme. Larger tiles trade more; brighter tiles
        carry a higher implied probability.
      </p>
      <MarketTreemap data={treemapData} />

      <hr className="my-8 border-white/10" />

      <h2 className="mb-1 text-lg font-medium">Conviction scatter</h2>
      <p className="mb-3 text-sm text-muted">
        Most macro markets are priced near a yes or a no. The ones sitting high in the middle band are where real
        money disagrees.
      </p>
      <ConvictionScatter points={scatterData} />

      <hr className="my-8 border-white/10" />

      <h2 className="mb-1 text-lg font-medium">Top movers (7 days)</h2>
      <p className="mb-2 text-sm text-muted">
        Biggest probability moves over the past week, from Kalshi and Polymarket price history.
      </p>
      {slopeMovers === null ? (
        <p className="text-sm text-muted">Loading movers...</p>
      ) : (
        <MoversSlope movers={slopeMovers} />
      )}
    </div>
  );
}
