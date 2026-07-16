"use client";
import { useMemo } from "react";
import { representativeByEvent } from "@/lib/board";
import { buildTreemap, buildScatter } from "@/lib/mapData";
import { MarketTreemap } from "./charts/MarketTreemap";
import { ConvictionScatter } from "./charts/ConvictionScatter";
import type { Market } from "@/lib/types";

const TREEMAP_LIMIT = 45;

export function MarketMapView({ markets }: { markets: Market[] }) {
  const reps = useMemo(() => representativeByEvent(markets), [markets]);
  const treemapData = useMemo(() => buildTreemap(reps, TREEMAP_LIMIT), [reps]);
  const scatterData = useMemo(() => buildScatter(reps), [reps]);

  if (!reps.length) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold">Market Map</h1>
        <p className="text-sm text-muted">No markets to map.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Market Map</h1>
      <p className="mb-4 text-sm text-muted">
        Two views of where volume and conviction sit across the board - biggest markets by size, and where the
        crowd is genuinely undecided.
      </p>

      <h2 className="mb-1 text-lg font-medium">Biggest markets by volume</h2>
      <p className="mb-2 text-sm text-muted">
        Top {TREEMAP_LIMIT} markets by volume, grouped by theme - tile size = volume, tile colour = implied
        probability.
      </p>
      <MarketTreemap data={treemapData} />
      <p className="mt-2 text-xs text-muted">
        Volume mixes Kalshi contracts and Polymarket USD - compare within a theme, not across platforms.
      </p>

      <hr className="my-8 border-white/10" />

      <h2 className="mb-1 text-lg font-medium">Conviction scatter</h2>
      <p className="mb-2 text-sm text-muted">
        Implied probability (x) vs volume (y, log scale), one dot per market coloured by theme. Markets sitting
        high-volume near the dashed 50% line are genuinely contested.
      </p>
      <ConvictionScatter points={scatterData} />
    </div>
  );
}
