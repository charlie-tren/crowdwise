import type { ScenarioMap } from "./types";

// Box geometry in CSS pixels. Positions below are CENTRES.
//
// 188, not 168: pctScenario now renders two decimal places unconditionally
// (see lib/format.ts), so the value/range line got wider everywhere, and the
// worst case is a near-certain node that still carries a visible range - eg.
// value "100.00%" next to range "95.00% to 100.00%". Measured in a real SVG
// text node at the old 168px, that pairing overlapped by roughly 5.6px (the
// range's left edge landed inside the value's own text). 188px was the
// narrowest round figure that puts a comfortable gap (about 14px) between
// them for that same worst case, leaving normal, shorter figures with even
// more room.
export const NODE_W = 188;
// 72, not 56: the label now wraps to two lines (see wrapLabel in MapView.tsx)
// so a depends node's two conditional branches stay distinguishable instead
// of both truncating to the same text. GAP_Y is left as is; at this NODE_H
// the ratio between the two is still comfortable.
//
// 88, not 72: an input node's box now holds a drag track along its bottom
// edge (see EstimateTrack.tsx), which needs room below the value/range text.
// Every node in a column shares one height regardless of kind, so a market
// or formula box grows the same 16px even though it carries no track - the
// alternative, a per-kind box height, would misalign every row in a column
// that mixes kinds, which is worse than some empty space under a market box.
export const NODE_H = 88;
const GAP_X = 56;
const GAP_Y = 22;
// Exported: MapView clamps a node being dragged live to the same margin this
// module clamps a stored position to, so the two never disagree about where
// the boundary is (see the module comment on manual positions below).
export const PAD = 8;

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
  const derivedHeight = PAD * 2 + tallest * NODE_H + (tallest - 1) * GAP_Y;
  const derivedWidth = Math.max(width, PAD * 2 + columns.length * NODE_W + (columns.length - 1) * GAP_X);

  // The derived (barycentre) slot for every node - the fallback used whenever
  // a node carries no manual position of its own, and the target the "Reset
  // layout" control in ScenarioMap.tsx returns a moved node to.
  const derived = new Map<string, { x: number; y: number }>();
  columns.forEach((col, c) => {
    const colHeight = col.length * NODE_H + (col.length - 1) * GAP_Y;
    const top = (derivedHeight - colHeight) / 2;
    col.forEach((id, i) => {
      derived.set(id, {
        x: PAD + NODE_W / 2 + c * (NODE_W + GAP_X),
        y: top + NODE_H / 2 + i * (NODE_H + GAP_Y),
      });
    });
  });

  // A reader's own placement, when they have set one, otherwise the derived
  // slot above. Clamped so a node dragged above or left of the origin cannot
  // put itself (or drag the canvas) into negative space - the box's own top-left
  // corner is never allowed past the same PAD margin the derived layout already
  // keeps everything inside of. This is a clamp, not a shift of the whole
  // coordinate space: the alternative (sliding every OTHER node to make room)
  // would move nodes the reader never touched, which is worse than the one
  // they dragged simply stopping at the edge.
  const finalPos = new Map<string, { x: number; y: number }>();
  for (const n of map.nodes) {
    const manual = n.position;
    const base = manual ?? derived.get(n.id);
    if (!base) continue;
    finalPos.set(n.id, {
      x: Math.max(PAD + NODE_W / 2, base.x),
      y: Math.max(PAD + NODE_H / 2, base.y),
    });
  }

  // Built in the same column-major, barycentre-ordered walk as before (not
  // map.nodes order): the "deterministic and independent of node order" test
  // depends on this array's order coming from the graph's structure, not from
  // whatever order the caller happened to supply nodes in.
  const nodes: LayoutNode[] = [];
  const pos = new Map<string, LayoutNode>();
  columns.forEach((col, c) => {
    col.forEach((id) => {
      const p = finalPos.get(id)!;
      const node: LayoutNode = { id, x: p.x, y: p.y, layer: c };
      nodes.push(node);
      pos.set(id, node);
    });
  });

  // The canvas must contain every node wherever it was put, not just the
  // derived grid: it grows to the right and down for a node dragged past the
  // original bounds, and never shrinks below the derived minimum (which also
  // keeps the sideways-scrolling container filling its own width when the map
  // is small). Height has no equivalent "fill the container" floor - see the
  // note on MapView's container, which scrolls sideways but simply grows the
  // page vertically rather than opening its own vertical scrollbar.
  let canvasW = derivedWidth;
  let canvasH = derivedHeight;
  for (const p of finalPos.values()) {
    canvasW = Math.max(canvasW, p.x + NODE_W / 2 + PAD);
    canvasH = Math.max(canvasH, p.y + NODE_H / 2 + PAD);
  }

  // Walk `nodes` (already laid out in deterministic, id/barycentre order), not
  // `map.nodes`: the same graph supplied in a different node order must yield
  // the same edge array, not just the same edge set. Endpoints come from
  // `pos`, which carries each node's FINAL (manual-or-derived) position, so
  // an edge follows its nodes wherever they were dragged.
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

  return { nodes, edges, width: canvasW, height: canvasH };
}
