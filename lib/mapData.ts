import { CATEGORIES } from "./taxonomy";
import type { Market } from "./types";

export interface TreemapLeaf { id: string; name: string; size: number; prob: number; title: string; }
export interface TreemapNode { name: string; children: TreemapLeaf[]; }

const MAX_TITLE = 40;
const truncate = (s: string) => (s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s);

// Top `limit` markets by volume that have BOTH a prob and volume>0, grouped by
// theme into a 2-level structure for a treemap (theme -> markets). Themes with
// no qualifying markets are omitted. Leaves carry size=volume, prob, title.
export function buildTreemap(markets: Market[], limit = 45): TreemapNode[] {
  const qualifying = markets.filter((m) => m.prob != null && m.volume > 0);
  qualifying.sort((a, b) => b.volume - a.volume);
  const top = qualifying.slice(0, limit);

  const nodes: TreemapNode[] = [];
  for (const cat of CATEGORIES) {
    const members = top.filter((m) => m.category === cat);
    if (!members.length) continue;
    nodes.push({
      name: cat,
      children: members.map((m) => ({
        id: m.id,
        name: truncate(m.title),
        size: m.volume,
        prob: m.prob as number,
        title: m.title,
      })),
    });
  }
  return nodes;
}

// Markets with a prob and volume>0, shaped for the conviction scatter.
export interface ScatterPoint { id: string; x: number; y: number; category: string; title: string; }
export function buildScatter(markets: Market[]): ScatterPoint[] {
  return markets
    .filter((m) => m.prob != null && m.volume > 0)
    .map((m) => ({
      id: m.id,
      x: +((m.prob as number) * 100).toFixed(1),
      y: m.volume,
      category: m.category,
      title: m.title,
    }));
}
