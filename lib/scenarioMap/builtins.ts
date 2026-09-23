import { resolveThesis, THESES } from "@/lib/thesis";
import type { Market } from "@/lib/types";
import type { MapNode, ScenarioMap } from "./types";

/**
 * The four theses as maps. The legs are resolved through lib/thesis.ts's own
 * predicates at render time, so no market id is ever written down here: ids churn
 * and a map that hardcoded one would quietly go blank.
 *
 * A leg with no market becomes a market node with an empty marketId, which the
 * engine reports as "No live market on the board". That is deliberate: a partial
 * map showing three of four legs beats a map that hides itself.
 */
export function builtInMaps(markets: Market[]): ScenarioMap[] {
  return THESES.map((thesis) => {
    const resolved = resolveThesis(thesis, markets);
    const legNodes: MapNode[] = resolved.legs.map((leg, i) => ({
      id: `${thesis.key}-leg-${i}`,
      kind: "market",
      label: leg.label,
      marketId: leg.market?.id ?? "",
      side: leg.side,
    }));
    const combined: MapNode = {
      id: `${thesis.key}-combined`,
      kind: "formula",
      label: thesis.name,
      op: "and",
      refs: legNodes.map((n) => n.id),
    };
    return { id: thesis.key, name: thesis.name, nodes: [...legNodes, combined], builtIn: true };
  });
}
