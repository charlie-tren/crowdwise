"use client";
import { useEffect, useRef, useState } from "react";
import { pctScenario } from "@/lib/format";
import { layoutMap, NODE_H, NODE_W, PAD } from "@/lib/scenarioMap/layout";
import type { LayoutNode } from "@/lib/scenarioMap/layout";
import type { InputNode, MapNode, MarketNode, NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { Market } from "@/lib/types";
import { EstimateTrack } from "./EstimateTrack";

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

// The track sits inset from the box edges by the same 10px the label and
// figure text already use, so its ends line up with them rather than
// bleeding to the box border.
const TRACK_INSET = 10;
const TRACK_WIDTH = NODE_W - TRACK_INSET * 2;
// A few px up from the bottom edge, clear of the rounded corners.
const TRACK_Y = NODE_H - 18;

export function MapView({
  map, results, markets = [], width: fixedWidth, onChange,
}: {
  map: ScenarioMap;
  results: Map<string, NodeResult>;
  markets?: Market[];
  width?: number;
  onChange?: (next: ScenarioMap) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  // Paint order for the nodes: normally the layout's own column order, but a
  // node the reader has grabbed is drawn LAST from then on, so it settles on
  // top of whatever it was dropped onto instead of staying buried behind it.
  // This is `frontOrder`, a list of ids oldest-brought-forward first - only
  // ids that have been touched appear in it at all, and the last id in it
  // paints last (on top). It is deliberately NOT part of `map`: the node
  // order the map's own array carries is what the node list, the outline and
  // the share payload all read, and disturbing it just to change paint order
  // would leak a purely cosmetic concern into all three. It also does not
  // need to survive a save or a share link - the next time this exact map is
  // opened (by this reader after a reload, or by whoever a link is shared
  // with) nothing has been dragged in THAT session yet, so there is nothing
  // to bring forward and the plain layout order is already correct.
  const [frontOrder, setFrontOrder] = useState<string[]>([]);

  // A different map replacing this one (a chip click, "New map", a shared
  // link landing) makes any remembered stacking meaningless - it names ids
  // that may not even exist on the new map, or that collide by coincidence
  // with different nodes. Reset it the moment the map identity changes, using
  // the ordinary "adjust state while rendering" pattern rather than an
  // effect: the render that sees a new id bails out immediately into a
  // second render with the reset state already applied, with no extra frame
  // and nothing for react-hooks/set-state-in-effect to flag.
  const [frontOrderMapId, setFrontOrderMapId] = useState(map.id);
  if (frontOrderMapId !== map.id) {
    setFrontOrderMapId(map.id);
    setFrontOrder([]);
  }

  const bringToFront = (id: string) =>
    setFrontOrder((order) => (order.at(-1) === id ? order : [...order.filter((x) => x !== id), id]));

  // Dragging a node's BODY moves it; dragging its value track (EstimateTrack,
  // rendered as a sibling further down this same node group) changes its
  // number. The two gestures are kept apart structurally, not by
  // stopPropagation: these pointer handlers are attached only to the node's
  // background <rect>, never to the wrapping <g> the track also lives in, so
  // a pointerdown that lands on the track's hit circle is never even seen
  // here - there is no shared ancestor for it to bubble through into. One
  // node drags at a time, so a single ref (not one per node) is enough,
  // mirroring EstimateTrack's own drag-state shape: a start snapshot, a
  // throttling animation frame, and the not-yet-committed position it owes
  // onChange.
  const nodeDrag = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const nodeDragFrame = useRef<number | null>(null);
  const pendingNodeDrag = useRef<{ id: string; x: number; y: number } | null>(null);

  const clearNodeDragFrame = () => {
    if (nodeDragFrame.current != null) {
      cancelAnimationFrame(nodeDragFrame.current);
      nodeDragFrame.current = null;
    }
  };
  useEffect(() => () => {
    clearNodeDragFrame();
    pendingNodeDrag.current = null;
  }, []);

  const commitNodeDrag = (p: { id: string; x: number; y: number }) => {
    if (!onChange) return;
    onChange({
      ...map,
      nodes: map.nodes.map((n) => (n.id === p.id ? ({ ...n, position: { x: p.x, y: p.y } } as MapNode) : n)),
    });
  };

  // Clamped to the exact same PAD/NODE_W/NODE_H margin layoutMap itself
  // clamps a stored position to (see PAD's export there), so what the reader
  // sees settle under their pointer during the drag is never a different
  // place than where the next render's layoutMap will put it.
  const clampToCanvas = (x: number, y: number) => ({
    x: Math.max(PAD + NODE_W / 2, x),
    y: Math.max(PAD + NODE_H / 2, y),
  });

  const onNodePointerDown = (e: React.PointerEvent<SVGRectElement>, id: string, startX: number, startY: number) => {
    if (!onChange) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    nodeDrag.current = { id, startClientX: e.clientX, startClientY: e.clientY, startX, startY };
    // The node comes to the front the moment it is grabbed, not only once the
    // pointer has actually moved: the reader has already started touching it,
    // and a click-without-drag bumping it forward is harmless.
    bringToFront(id);
  };

  const onNodePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const s = nodeDrag.current;
    if (!s) return;
    const { x, y } = clampToCanvas(s.startX + (e.clientX - s.startClientX), s.startY + (e.clientY - s.startClientY));
    clearNodeDragFrame();
    pendingNodeDrag.current = { id: s.id, x, y };
    nodeDragFrame.current = requestAnimationFrame(() => {
      nodeDragFrame.current = null;
      const toCommit = pendingNodeDrag.current;
      pendingNodeDrag.current = null;
      if (toCommit) commitNodeDrag(toCommit);
    });
  };

  const endNodeDrag = () => {
    nodeDrag.current = null;
    // Same fast-drag fix as EstimateTrack's endDrag: flush whatever the last
    // scheduled frame was about to commit right now, synchronously, rather
    // than losing it to a frame that never got a chance to fire before release.
    clearNodeDragFrame();
    const toCommit = pendingNodeDrag.current;
    pendingNodeDrag.current = null;
    if (toCommit) commitNodeDrag(toCommit);
  };

  useEffect(() => {
    if (fixedWidth != null || !box.current) return;
    const el = box.current;

    // Measure synchronously first. ResizeObserver is only guaranteed to
    // deliver its FIRST callback on a later microtask/frame, and it has been
    // observed inert altogether in at least one real browser (laid out
    // correctly at 1086px, callback never fired). A degradation path must
    // degrade to less, never to nothing, so the first paint cannot depend on
    // the observer firing at all: it reads the element's own box right away,
    // and the observer only refines that measurement on later changes.
    setMeasured(el.getBoundingClientRect().width);

    // Some environments do not have ResizeObserver at all. The synchronous
    // measurement above already covers the initial paint, so skipping the
    // observer there just means later resizes are not tracked - survivable,
    // and cheap to guard against.
    if (typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => setMeasured(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidth]);

  const width = fixedWidth ?? measured;
  const layout = width > 0 ? layoutMap(map, width) : null;

  // The nodes never touched by frontOrder keep the layout's own order; the
  // touched ones are appended in the order they were brought forward, so the
  // most recently grabbed one is always last - and so always on top. Filtered
  // through `layout.nodes` rather than iterating `frontOrder` alone, so a
  // stale id (a node deleted after being dragged) just drops out instead of
  // rendering nothing.
  const paintOrder: LayoutNode[] = layout
    ? frontOrder.length === 0
      ? layout.nodes
      : (() => {
          const front = new Set(frontOrder);
          const byNodeId = new Map(layout.nodes.map((ln) => [ln.id, ln]));
          const untouched = layout.nodes.filter((ln) => !front.has(ln.id));
          const brought = frontOrder.map((id) => byNodeId.get(id)).filter((ln): ln is LayoutNode => ln != null);
          return [...untouched, ...brought];
        })()
    : [];

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

  // An input node's low/likely/high ARE the reader's own judgement, so a drag
  // there writes them directly. A market node's live price is not the
  // reader's to move - dragging it instead sets `override`, a separate
  // what-if that never touches the venue price a market node also carries
  // (see NodeResult.livePrice). A formula is computed and stays underived -
  // see the note on resolveNodes in engine.ts for why dragging one is a
  // different feature, not built here. Building brand-new map objects rather
  // than mutating `map`: the built-in maps are rebuilt from the live board on
  // every render, and mutating one here would corrupt that shared object.
  const updateEstimate = (id: string, range: { low: number; likely: number; high: number }) => {
    if (!onChange) return;
    onChange({
      ...map,
      nodes: map.nodes.map((n) => (n.id === id ? ({ ...n, ...range } as MapNode) : n)),
    });
  };

  const updateMarketOverride = (id: string, value: number) => {
    if (!onChange) return;
    onChange({
      ...map,
      nodes: map.nodes.map((n) => (n.id === id && n.kind === "market" ? { ...n, override: value } : n)),
    });
  };

  const clearMarketOverride = (id: string) => {
    if (!onChange) return;
    onChange({
      ...map,
      nodes: map.nodes.map((n) => (n.id === id && n.kind === "market" ? { ...n, override: undefined } : n)),
    });
  };

  // EstimateTrack draws a low..high band around a likely point; a market
  // override is a single value, not a band. Rather than build a second drag
  // component, this hands EstimateTrack a synthetic input-shaped node whose
  // low, likely and high are all the same number - a zero-width band. That is
  // enough for dragMath.ts's shiftRange to work completely unmodified (the
  // delta it applies moves all three together, clamped at 0/1 exactly as for
  // a real band), and the band rectangle MapView/EstimateTrack draws between
  // low and high collapses to Math.max(0, highX - lowX) = 0 - visually
  // nothing but the handle, which is exactly what a single point should look
  // like. The alternative (a boolean "single value" prop on EstimateTrack)
  // would mean two rendering paths for the same maths; this needs none.
  const trackNodeFor = (node: MapNode, r?: NodeResult): InputNode => {
    if (node.kind === "input") return node;
    const v = (node as MarketNode).override ?? r?.livePrice ?? 0;
    return { id: node.id, kind: "input", label: node.label, low: v, likely: v, high: v, source: "" };
  };

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
          {paintOrder.map((ln) => {
            const node = byId.get(ln.id)!;
            const r = results.get(ln.id);
            const colour = colourFor(node);
            const ok = r?.status === "ok";
            const hasRange = ok && r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005;
            const labelLines = wrapLabel(node.label);
            return (
              <g key={ln.id} data-node data-node-id={ln.id} transform={`translate(${ln.x - NODE_W / 2}, ${ln.y - NODE_H / 2})`}>
                <rect
                  width={NODE_W} height={NODE_H} rx={10}
                  fill="rgba(255,255,255,0.03)"
                  stroke={ok ? colour : "rgba(255,255,255,0.10)"}
                  strokeWidth={1}
                  style={onChange ? { cursor: "grab", touchAction: "none" } : undefined}
                  onPointerDown={onChange ? (e) => onNodePointerDown(e, ln.id, ln.x, ln.y) : undefined}
                  onPointerMove={onChange ? onNodePointerMove : undefined}
                  onPointerUp={onChange ? endNodeDrag : undefined}
                  onPointerCancel={onChange ? endNodeDrag : undefined}
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
                    {/* This is the node's headline figure: its own live price
                        ordinarily, or the what-if override once one is set -
                        the two are never shown in the same slot at once, which
                        is what the subordinate live-price text below is for. */}
                    <text x={10} y={55} fontSize={17} fontWeight={600} fill={colour} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pctScenario(r.p50)}
                    </text>
                    {hasRange && (
                      <text x={NODE_W - 10} y={55} textAnchor="end" fontSize={10.5} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {pctScenario(r.p10)} to {pctScenario(r.p90)}
                      </text>
                    )}
                    {/* A market node's own venue price, printed whenever an
                        override is active - hasRange is always false for a
                        market node (it is a constant, p10 === p50 === p90), so
                        this never collides with the range text above. This is
                        the whole answer to "can the reader tell a what-if from
                        the real thing": the big figure is whichever one is
                        current, and this quiet "live X%" is only ever drawn
                        when the two differ. It is also the reset - a click (or
                        Enter/Space) clears the override, right where the drag
                        happened, so getting back costs exactly what setting it
                        did. */}
                    {node.kind === "market" && (node as MarketNode).override != null && r.livePrice != null && (
                      <text
                        x={NODE_W - 10} y={55} textAnchor="end" fontSize={10.5} fill="var(--muted)"
                        role="button" tabIndex={0}
                        aria-label={`Clear the what-if and return to the live price, ${pctScenario(r.livePrice)}`}
                        style={{
                          fontVariantNumeric: "tabular-nums", cursor: "pointer",
                          textDecoration: "underline", textDecorationStyle: "dotted",
                        }}
                        onClick={() => clearMarketOverride(node.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clearMarketOverride(node.id); }
                        }}
                      >
                        live {pctScenario(r.livePrice)}
                      </text>
                    )}
                  </>
                ) : (
                  <text x={10} y={55} fontSize={10.5} fill="var(--muted-dim)">
                    {truncate(r?.reason ?? "Unresolved", 28)}
                  </text>
                )}
                {/* An input node always gets a track; a market node gets one
                    exactly when it has a live price to drag away from - a
                    market missing from the board has nothing to override (see
                    the engine.ts comment on resolveNodes). A formula stays
                    underived and never gets one - see the note there. The
                    track's presence (or absence) is the whole signal for "you
                    can drag this one", with nothing written on the box to say
                    so. */}
                {(node.kind === "input" || (node.kind === "market" && r?.livePrice != null)) && (
                  <g transform={`translate(${TRACK_INSET}, ${TRACK_Y})`}>
                    <EstimateTrack
                      node={trackNodeFor(node, r)}
                      units={TRACK_WIDTH}
                      onChange={(range) =>
                        node.kind === "input"
                          ? updateEstimate(node.id, range)
                          : updateMarketOverride(node.id, range.likely)
                      }
                      ariaLabel={
                        node.kind === "input"
                          ? `${node.label || "Estimate"} likelihood`
                          : `${node.label || "Market"} what-if likelihood`
                      }
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
