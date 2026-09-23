import type { ScenarioMap } from "./types";

// Box geometry in CSS pixels. Positions below are CENTRES.
export const NODE_W = 168;
export const NODE_H = 56;
const GAP_X = 56;
const GAP_Y = 22;
const PAD = 8;

export interface LayoutNode { id: string; x: number; y: number; layer: number }
export interface LayoutEdge { from: string; to: string; path: string }
export interface MapLayout { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number }

/**
 * Layered left to right, ordered within a layer by the barycentre of each node's
 * inputs so edges cross as little as possible.
 *
 * Positions are in CONTAINER pixels, never a fixed viewBox scaled to fit: scaling
 * a wide viewBox into a phone shrinks every label with it, which is how this
 * estate has shipped 4px axis text before.
 */
export function layoutMap(map: ScenarioMap, width: number): MapLayout {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const refsOf = (id: string): string[] => {
    const n = byId.get(id);
    return n && n.kind === "formula" ? n.refs.filter((r) => byId.has(r)) : [];
  };

  // Longest path from the leaves. `seen` breaks a cycle by treating the repeat
  // as a leaf, so a half-built map still draws. For a genuinely cyclic map the
  // layer that ends up cached for each node in the cycle depends on which
  // top-level node the loop below reaches first, so cyclic layering is
  // arbitrary and not worth making canonical. That is fine: the only
  // requirement for a cyclic map is that layout terminates and draws
  // something, which the `seen` guard already gives it.
  const layerCache = new Map<string, number>();
  const layerOf = (id: string, seen: Set<string>): number => {
    if (layerCache.has(id)) return layerCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const refs = refsOf(id);
    const l = refs.length ? 1 + Math.max(...refs.map((r) => layerOf(r, seen))) : 0;
    seen.delete(id);
    layerCache.set(id, l);
    return l;
  };
  const layers = new Map<string, number>();
  for (const n of map.nodes) layers.set(n.id, layerOf(n.id, new Set()));

  const maxLayer = Math.max(0, ...layers.values());
  const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  // Sort by id first so the result never depends on the order of the array.
  for (const n of [...map.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    columns[layers.get(n.id)!].push(n.id);
  }

  // Barycentre ordering: each column follows the mean position of its inputs in
  // the column before it. Column 0 keeps its id order.
  for (let c = 1; c < columns.length; c++) {
    const prevIndex = new Map(columns[c - 1].map((id, i) => [id, i]));
    const key = new Map<string, number>();
    columns[c].forEach((id, i) => {
      const positions = refsOf(id).map((r) => prevIndex.get(r)).filter((v): v is number => v != null);
      key.set(id, positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : i);
    });
    columns[c].sort((a, b) => key.get(a)! - key.get(b)! || a.localeCompare(b));
  }

  const tallest = Math.max(1, ...columns.map((col) => col.length));
  const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * GAP_Y;
  const canvasW = Math.max(width, PAD * 2 + columns.length * NODE_W + (columns.length - 1) * GAP_X);

  const nodes: LayoutNode[] = [];
  const pos = new Map<string, LayoutNode>();
  columns.forEach((col, c) => {
    const colHeight = col.length * NODE_H + (col.length - 1) * GAP_Y;
    const top = (height - colHeight) / 2;
    col.forEach((id, i) => {
      const node: LayoutNode = {
        id,
        x: PAD + NODE_W / 2 + c * (NODE_W + GAP_X),
        y: top + NODE_H / 2 + i * (NODE_H + GAP_Y),
        layer: c,
      };
      nodes.push(node);
      pos.set(id, node);
    });
  });

  // Walk `nodes` (already laid out in deterministic, id/barycentre order), not
  // `map.nodes`: the same graph supplied in a different node order must yield
  // the same edge array, not just the same edge set.
  const edges: LayoutEdge[] = [];
  for (const ln of nodes) {
    for (const ref of refsOf(ln.id)) {
      const from = pos.get(ref)!, to = pos.get(ln.id)!;
      const x1 = from.x + NODE_W / 2, x2 = to.x - NODE_W / 2;
      const mid = (x1 + x2) / 2;
      edges.push({
        from: ref,
        to: ln.id,
        path: `M ${x1} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${x2} ${to.y}`,
      });
    }
  }

  return { nodes, edges, width: canvasW, height };
}
