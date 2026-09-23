"use client";
import { useEffect, useRef, useState } from "react";
import { pctScenario } from "@/lib/format";
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

// A depends node's whole point is contrasting two conditional branches, eg.
// "Recession, if the Fed cuts" against "Recession, if the Fed holds all
// year". A single 22-char truncated line collapses both to "Recession, if
// the Fed…", so the reader cannot tell the boxes apart. Two lines roughly
// doubles what is visible, wrapping on word boundaries, and only reaches for
// an ellipsis if the text still does not fit. Pure and deterministic - no
// runtime measurement, same character budget the old single-line truncation
// used, just spread over two lines.
const LABEL_LINE_CHARS = 22;
const LABEL_MAX_LINES = 2;

export function wrapLabel(
  label: string,
  lineChars: number = LABEL_LINE_CHARS,
  maxLines: number = LABEL_MAX_LINES,
): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let i = 0;

  while (i < words.length && lines.length < maxLines) {
    let line = "";
    while (i < words.length) {
      const word = words[i];
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > lineChars) {
        if (line === "") {
          // A single word longer than a whole line: hard-truncate it rather
          // than let it overflow the box.
          line = word.length > lineChars ? `${word.slice(0, lineChars - 1)}…` : word;
          i++;
        }
        break;
      }
      line = candidate;
      i++;
    }
    lines.push(line);
  }

  // Words remain after filling every allowed line: the label still overflows,
  // so mark the cut with an ellipsis (unless the loop above already put one
  // there for an unbreakable word).
  const overflow = i < words.length;
  const lastIndex = lines.length - 1;
  if (overflow && !lines[lastIndex].endsWith("…")) {
    const room = lineChars - 1;
    lines[lastIndex] = lines[lastIndex].length > room
      ? `${lines[lastIndex].slice(0, room)}…`
      : `${lines[lastIndex]}…`;
  }

  return lines;
}

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
            const labelLines = wrapLabel(node.label);
            return (
              <g key={ln.id} data-node transform={`translate(${ln.x - NODE_W / 2}, ${ln.y - NODE_H / 2})`}>
                <rect
                  width={NODE_W} height={NODE_H} rx={10}
                  fill="rgba(255,255,255,0.03)"
                  stroke={ok ? colour : "rgba(255,255,255,0.10)"}
                  strokeWidth={1}
                />
                {labelLines.length > 0 && (
                  <text x={10} y={16} fontSize={11.5} fill="var(--text)">
                    {labelLines.map((line, i) => (
                      <tspan key={i} x={10} dy={i === 0 ? 0 : 13}>{line}</tspan>
                    ))}
                  </text>
                )}
                {ok ? (
                  <>
                    <text x={10} y={55} fontSize={17} fontWeight={600} fill={colour} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pctScenario(r.p50)}
                    </text>
                    {hasRange && (
                      <text x={NODE_W - 10} y={55} textAnchor="end" fontSize={10.5} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {pctScenario(r.p10)} to {pctScenario(r.p90)}
                      </text>
                    )}
                  </>
                ) : (
                  <text x={10} y={55} fontSize={10.5} fill="var(--muted-dim)">
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
