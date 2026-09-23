"use client";
import { useEffect, useRef, useState } from "react";
import { pct } from "@/lib/format";
import { layoutMap, NODE_H, NODE_W } from "@/lib/scenarioMap/layout";
import type { NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { Market } from "@/lib/types";

// Kind, not probability. The blue ramp in lib/format.ts means magnitude, so it
// cannot be reused here: a node's colour has to say what KIND of number it is.
// A market takes its own theme colour from the board, exactly as the board does,
// so one proposition is the same hue wherever it appears on the site.
//
// Bug fix: the plan's FORMULA_COLOUR was "#7cc4ff", which is not just blue-ish
// but the EXACT top stop of PROB_STOPS in lib/format.ts (probFill's rgb(124,
// 196, 255) at p=1.0). A formula sitting near certainty would render in the
// identical hue the magnitude ramp uses for "near certain" elsewhere on the
// site, which is precisely the confusion rule 4 exists to prevent. Moved to
// an amber that shares no stop with the blue sequential ramp.
const INPUT_COLOUR = "#8b93a7";
const FORMULA_COLOUR = "#f5a524";
const FALLBACK_MARKET_COLOUR = "#4c9be8";

export function MapView({
  map, results, markets = [], width: fixedWidth,
}: {
  map: ScenarioMap;
  results: Map<string, NodeResult>;
  markets?: Market[];
  width?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    if (fixedWidth != null || !box.current) return;
    const el = box.current;
    const ro = new ResizeObserver((entries) => setMeasured(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidth]);

  const width = fixedWidth ?? measured;
  const layout = width > 0 ? layoutMap(map, width) : null;
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const categoryById = new Map(markets.map((m) => [m.id, m.category]));

  const colourFor = (node: ScenarioMap["nodes"][number]): string => {
    if (node.kind === "input") return INPUT_COLOUR;
    if (node.kind === "formula") return FORMULA_COLOUR;
    return THEME_COLOURS[categoryById.get(node.marketId) ?? ""] ?? FALLBACK_MARKET_COLOUR;
  };

  // Cut long text with a trailing ellipsis so the reader can SEE it was cut,
  // rather than silently landing on a broken word. The label truncation
  // below already did this; the plan's reason truncation did not (a bare
  // `.slice(0, 28)`), which chopped mid-word in most of the reasons engine.ts
  // actually produces - eg. "Circular: this node feeds it" (itself, cut) and
  // "The calculation did not prod" (produce, cut). A truncated reason that
  // reads as a different, wrong sentence is worse than no reason at all.
  const truncate = (s: string, max: number): string =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;

  return (
    <div ref={box} className="hidden w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:block">
      {layout && (
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          // NOT role="img": the nodes are readable content, and role="img" would
          // present the whole panel as one picture and hide them.
          aria-label={`Map of ${map.name}`}
        >
          <g>
            {layout.edges.map((e) => (
              <path
                key={`${e.from}-${e.to}`}
                data-edge
                d={e.path}
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth={1.5}
              />
            ))}
          </g>
          {layout.nodes.map((ln) => {
            const node = byId.get(ln.id)!;
            const r = results.get(ln.id);
            const colour = colourFor(node);
            const ok = r?.status === "ok";
            const hasRange = ok && r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005;
            return (
              <g key={ln.id} data-node transform={`translate(${ln.x - NODE_W / 2}, ${ln.y - NODE_H / 2})`}>
                <rect
                  width={NODE_W} height={NODE_H} rx={10}
                  fill="rgba(255,255,255,0.03)"
                  stroke={ok ? colour : "rgba(255,255,255,0.10)"}
                  strokeWidth={1}
                />
                <text x={10} y={19} fontSize={11.5} fill="var(--text)">
                  {truncate(node.label, 22)}
                </text>
                {ok ? (
                  <>
                    <text x={10} y={40} fontSize={17} fontWeight={600} fill={colour} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pct(r.p50, 0)}
                    </text>
                    {hasRange && (
                      <text x={NODE_W - 10} y={40} textAnchor="end" fontSize={10.5} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {pct(r.p10, 0)} to {pct(r.p90, 0)}
                      </text>
                    )}
                  </>
                ) : (
                  <text x={10} y={39} fontSize={10.5} fill="var(--muted-dim)">
                    {truncate(r?.reason ?? "Unresolved", 28)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
