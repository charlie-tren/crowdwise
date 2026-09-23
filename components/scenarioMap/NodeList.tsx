"use client";
import { useState } from "react";
import { pctScenario } from "@/lib/format";
import type { InputNode, MapNode, MarketNode, NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";
import { EstimateTrack, TRACK_H, TRACK_UNITS } from "./EstimateTrack";

const FOCUS_RING = "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const FIELD = `w-20 rounded-md border border-white/10 bg-panel/40 px-2 py-1 text-[13px] tabular-nums outline-none ${FOCUS_RING}`;

// What the reader gets from each kind, not how it is stored.
const KIND_LABEL: Record<MapNode["kind"], string> = {
  market: "Live market",
  input: "Estimate",
  formula: "Formula",
};

const OP_LABEL: Record<string, string> = {
  and: "All of them (AND)",
  or: "At least one (OR)",
  not: "The opposite (NOT)",
  mix: "Weighted average",
  depends: "Conditional on another node",
};

// A percentage field's raw text, parsed back to a 0..1 fraction. An empty
// field is NOT the same as "0": Number("") is 0 in JS, so a naive parse would
// turn a reader clearing the box to retype it into a confident, silent 0 -
// a number they never typed, displayed as if it were real. Empty (or
// otherwise unparseable) text instead becomes NaN, which the engine already
// treats as an unusable estimate ("Estimates must be between 0 and 1") and
// reports as a reason, never a number - the same shape of fix as the NaN
// market price and the non-finite clamp01 input elsewhere in this feature.
function parsePercent(raw: string): number {
  if (raw.trim() === "") return NaN;
  return Number(raw) / 100;
}

export function NodeList({
  map, results, markets, onChange,
}: {
  map: ScenarioMap;
  results: Map<string, NodeResult>;
  markets: Market[];
  onChange: (next: ScenarioMap) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const replace = (id: string, patch: Partial<MapNode>) =>
    onChange({ ...map, nodes: map.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as MapNode) : n)) });

  // A market node's live price is not the reader's to move - a drag on its
  // track sets `override`, a separate what-if. See the matching comment on
  // MapView's updateMarketOverride.
  const updateMarketOverride = (id: string, value: number) =>
    onChange({
      ...map,
      nodes: map.nodes.map((n) => (n.id === id && n.kind === "market" ? { ...n, override: value } : n)),
    });

  const clearMarketOverride = (id: string) =>
    onChange({
      ...map,
      nodes: map.nodes.map((n) => (n.id === id && n.kind === "market" ? { ...n, override: undefined } : n)),
    });

  // See the matching, more fully commented copy of this in MapView.tsx: a
  // market override is a single value, so EstimateTrack (built for a
  // low/likely/high band) is handed a synthetic input-shaped node whose three
  // fields are all the same number - a zero-width band, reusing dragMath.ts
  // unmodified rather than building a second drag component.
  const trackNodeFor = (node: MapNode, r?: NodeResult): InputNode => {
    if (node.kind === "input") return node;
    const v = (node as MarketNode).override ?? r?.livePrice ?? 0;
    return { id: node.id, kind: "input", label: node.label, low: v, likely: v, high: v, source: "" };
  };

  // Removing a node also removes every ref to it. A formula left pointing at a
  // deleted node would read "Missing input" for ever with nothing to click.
  const remove = (id: string) => {
    setOpenId(null);
    onChange({
      ...map,
      nodes: map.nodes
        .filter((n) => n.id !== id)
        .map((n) => (n.kind === "formula" ? { ...n, refs: n.refs.filter((r) => r !== id) } : n)),
    });
  };

  return (
    <ul className="flex flex-col gap-2">
      {map.nodes.map((node) => {
        const r = results.get(node.id);
        const open = openId === node.id;
        return (
          <li key={node.id} className="rounded-xl border border-white/[0.06] bg-panel/40">
            <button
              onClick={() => setOpenId(open ? null : node.id)}
              aria-expanded={open}
              className={`flex w-full items-baseline gap-3 px-4 py-3 text-left ${FOCUS_RING}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[var(--text)]">{node.label}</span>
                <span className="text-[11px] text-muted">
                  {KIND_LABEL[node.kind]}
                  {node.kind === "input" && node.source ? ` · ${node.source}` : ""}
                  {node.kind === "market" ? ` · ${node.side === "no" ? "NO" : "YES"} side` : ""}
                  {node.kind === "formula" ? ` · ${OP_LABEL[node.op] ?? node.op}` : ""}
                </span>
              </span>
              {r?.status === "ok" ? (
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums text-[17px] font-semibold text-accent">{pctScenario(r.p50)}</span>
                  {r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005 && (
                    <span className="block tabular-nums text-[11px] text-muted">
                      {pctScenario(r.p10)} to {pctScenario(r.p90)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-[var(--muted-dim)]">{r?.reason ?? "Unresolved"}</span>
              )}
            </button>

            {/* Reachable without opening the row - a phone is where dragging is
                most natural, and a control only reachable after a tap plus a
                drag is not reachable at all in practice. An input node always
                gets one; a market node gets one exactly when it has a live
                price to drag away from (see MapView's matching comment). A
                formula stays underived and never gets one. Sibling to the
                button, not nested in it, so the track's own focus/click never
                toggles the row open. */}
            {(node.kind === "input" || (node.kind === "market" && r?.livePrice != null)) && (
              <div className="px-4 pb-3">
                {/* The what-if figure is already the row's headline above;
                    this is only the live price, subordinate, and the reset -
                    the same job as the "live X%" text drawn on the node in
                    MapView. A real <button>, not nested inside the row's own
                    toggle button above (this div is that button's SIBLING). */}
                {node.kind === "market" && (node as MarketNode).override != null && r?.livePrice != null && (
                  <button
                    type="button"
                    onClick={() => clearMarketOverride(node.id)}
                    // aria-label, not just the visible "live X%": the row's
                    // own toggle button above already carries the text "Live
                    // market" (see KIND_LABEL), so a name search for "live"
                    // alone would match both buttons. "Reset" is unambiguous.
                    aria-label={`Reset to the live price, ${pctScenario(r.livePrice)}`}
                    className={`mb-1.5 block tabular-nums text-[11px] text-muted underline decoration-dotted hover:text-[var(--text)] ${FOCUS_RING}`}
                  >
                    live {pctScenario(r.livePrice)}
                  </button>
                )}
                {/* overflow: visible - without it this SVG clips to its own
                    16px-tall viewport (the browser default for svg is
                    overflow: hidden), which would silently cut the drag
                    handle's enlarged touch target (see HIT_R in
                    EstimateTrack.tsx) down to ~16px tall here, right where a
                    real thumb needs the full target most: this row is the
                    only place the control appears on a phone. Nothing else
                    in the track draws outside the nominal 16px box, so this
                    has no other visual effect. */}
                <svg
                  width="100%"
                  height={TRACK_H}
                  viewBox={`0 0 ${TRACK_UNITS} ${TRACK_H}`}
                  preserveAspectRatio="none"
                  style={{ overflow: "visible" }}
                >
                  <EstimateTrack
                    node={trackNodeFor(node, r)}
                    onChange={(range) =>
                      node.kind === "input"
                        ? replace(node.id, range as Partial<MapNode>)
                        : updateMarketOverride(node.id, range.likely)
                    }
                    ariaLabel={
                      node.kind === "input"
                        ? `${node.label || "Estimate"} likelihood`
                        : `${node.label || "Market"} what-if likelihood`
                    }
                  />
                </svg>
              </div>
            )}

            {open && (
              <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-3">
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  Label
                  <input
                    value={node.label}
                    onChange={(e) => replace(node.id, { label: e.target.value })}
                    className={`flex-1 rounded-md border border-white/10 bg-panel/40 px-2 py-1 text-[13px] text-[var(--text)] outline-none ${FOCUS_RING}`}
                  />
                </label>

                {node.kind === "input" && (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      {(["low", "likely", "high"] as const).map((k) => (
                        <label key={k} className="flex items-center gap-2 text-[12px] capitalize text-muted">
                          {k}
                          <input
                            aria-label={k}
                            type="number" min={0} max={100} step={1}
                            // Blank while the underlying fraction is not a finite
                            // number, rather than printing the literal text "NaN"
                            // into the box. This is also what keeps the field
                            // clearable: since the value the reader sees (empty)
                            // matches the value React puts back, there is no
                            // snap-back that would make emptying the box
                            // impossible.
                            value={Number.isFinite(node[k]) ? Math.round(node[k] * 100) : ""}
                            onChange={(e) =>
                              replace(node.id, { [k]: parsePercent(e.target.value) } as Partial<MapNode>)
                            }
                            className={FIELD}
                          />
                          <span className="text-muted">%</span>
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-[12px] text-muted">
                      Source
                      <input
                        value={node.source}
                        placeholder="Where this number came from"
                        onChange={(e) => replace(node.id, { source: e.target.value } as Partial<MapNode>)}
                        className={`flex-1 rounded-md border border-white/10 bg-panel/40 px-2 py-1 text-[13px] text-[var(--text)] outline-none ${FOCUS_RING}`}
                      />
                    </label>
                  </>
                )}

                {node.kind === "market" && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-4">
                      {(["yes", "no"] as const).map((side) => (
                        <label key={side} className="flex items-center gap-2 text-[12px] text-muted">
                          <input
                            type="radio"
                            aria-label={`${side.toUpperCase()} side`}
                            checked={node.side === side}
                            onChange={() => replace(node.id, { side } as Partial<MapNode>)}
                            className="accent-[var(--accent)]"
                          />
                          {side.toUpperCase()} side
                        </label>
                      ))}
                    </div>
                    <div className="text-[11px] text-muted">
                      {markets.find((m) => m.id === node.marketId)?.title ?? "Not on the board today"}
                    </div>
                  </div>
                )}

                {node.kind === "formula" && (
                  <div className="text-[12px] text-muted">
                    Reads:{" "}
                    {node.refs
                      .map((id) => map.nodes.find((n) => n.id === id)?.label ?? "missing")
                      .join(node.op === "depends" ? " | " : ", ")}
                    {node.op === "depends" && (
                      <span className="ml-1 text-[var(--muted-dim)]">(condition | if yes | if no)</span>
                    )}
                  </div>
                )}

                <div>
                  <button
                    onClick={() => remove(node.id)}
                    className={`rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
