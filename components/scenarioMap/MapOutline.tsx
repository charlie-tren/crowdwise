import { pct } from "@/lib/format";
import type { NodeResult, ScenarioMap } from "@/lib/scenarioMap/types";

/**
 * The narrow rendering. Below 640px the picture comes off entirely and the map is
 * an outline: a six-node graph at 375px is neither readable nor tappable, and when
 * a label and a decoration compete for a narrow screen the label is the content.
 * Every number and every source that the SVG shows is here too.
 */
export function MapOutline({ map, results }: { map: ScenarioMap; results: Map<string, NodeResult> }) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const read = new Set<string>();
  for (const n of map.nodes) if (n.kind === "formula") for (const r of n.refs) read.add(r);
  const roots = map.nodes.filter((n) => !read.has(n.id));

  const renderNode = (id: string, seen: Set<string>) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return null;
    const next = new Set(seen).add(id);
    const r = results.get(id);
    const refs = node.kind === "formula" ? node.refs.filter((x) => byId.has(x)) : [];
    return (
      <li key={id} className="mt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 text-[13px] text-[var(--text)]">{node.label}</span>
          {r?.status === "ok" ? (
            <span className="shrink-0 text-right">
              <span className="tabular-nums text-[15px] font-semibold text-accent">{pct(r.p50, 0)}</span>
              {r.p10 != null && r.p90 != null && r.p90 - r.p10 > 0.005 && (
                <span className="ml-2 tabular-nums text-[11px] text-muted">
                  {pct(r.p10, 0)} to {pct(r.p90, 0)}
                </span>
              )}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-[var(--muted-dim)]">{r?.reason ?? "Unresolved"}</span>
          )}
        </div>
        {node.kind === "input" && node.source && (
          <div className="text-[11px] text-muted">{node.source}</div>
        )}
        {node.kind === "market" && (
          <div className="text-[11px] text-muted">{node.side === "no" ? "NO side" : "YES side"}</div>
        )}
        {refs.length > 0 && (
          <ul className="ml-3 border-l border-white/[0.08] pl-3">
            {refs.map((ref) => renderNode(ref, next))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <ul className="sm:hidden">{roots.map((n) => renderNode(n.id, new Set()))}</ul>
  );
}
