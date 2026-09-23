"use client";
import { useState } from "react";
import { pct } from "@/lib/format";
import type { MapNode, NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";

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
                  <span className="block tabular-nums text-[17px] font-semibold text-accent">{pct(r.p50, 0)}</span>
                  {r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005 && (
                    <span className="block tabular-nums text-[11px] text-muted">
                      {pct(r.p10, 0)} to {pct(r.p90, 0)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-[var(--muted-dim)]">{r?.reason ?? "Unresolved"}</span>
              )}
            </button>

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
