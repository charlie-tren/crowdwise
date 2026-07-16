import { fetchKalshiMarkets, fetchPolymarketMarkets } from "./sources";
import { isMacroRelevant } from "./categorise";
import { CATEGORIES } from "./taxonomy";
import type { Market } from "./types";

const LIVE_STATUSES = new Set(["active", "open", ""]);

export async function fetchTopMarkets(includeKalshi = true, includePolymarket = true): Promise<Market[]> {
  const records: Market[] = [];
  if (includeKalshi) {
    try { records.push(...(await fetchKalshiMarkets())); }
    catch (err) { console.warn("Kalshi fetch failed", err); }
  }
  if (includePolymarket) {
    try { records.push(...(await fetchPolymarketMarkets())); }
    catch (err) { console.warn("Polymarket fetch failed", err); }
  }
  const liveMacro = records.filter((r) => isMacroRelevant(r) && LIVE_STATUSES.has(r.status));
  // fetchKalshiMarkets queries per-series; the same market can surface more than
  // once (e.g. overlapping series definitions), so dedupe by platform+id before sorting.
  const deduped = new Map<string, Market>();
  for (const r of liveMacro) {
    const key = `${r.platform}:${r.id}`;
    if (!deduped.has(key)) deduped.set(key, r);
  }
  const dedupedValues = [...deduped.values()];
  // Polymarket carries high-volume novelty/longshot nomination markets in
  // Elections/Politics (e.g. "Will LeBron James win the 2028 nomination?")
  // sitting at ~0-1% (or ~99%+) probability. These aren't macro signal, but
  // their volume lets them dominate a volume-sorted board/treemap, so drop
  // near-extreme Elections/Politics markets before sorting. Other themes
  // (e.g. Kalshi macro tail-risks like recession or an emergency Fed
  // meeting) are left untouched even at extreme probabilities.
  const out = dedupedValues.filter((r) => {
    if (r.category !== "Elections/Politics" || r.prob == null) return true;
    return !(r.prob < 0.02 || r.prob > 0.98);
  });
  out.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return out;
}

export function groupByCategory(records: Market[], perCategory?: number): Record<string, Market[]> {
  const grouped: Record<string, Market[]> = {};
  for (const cat of CATEGORIES) {
    let members = records.filter((r) => r.category === cat);
    if (perCategory !== undefined) members = members.slice(0, perCategory);
    if (members.length) grouped[cat] = members;
  }
  return grouped;
}

export function representativeByEvent(records: Market[]): Market[] {
  const byEvent = new Map<string, Market>();
  const singles: Market[] = [];
  for (const r of records) {
    const ev = r.event || "";
    if (!ev) { singles.push(r); continue; }
    const cur = byEvent.get(ev);
    if (!cur || (r.volume || 0) > (cur.volume || 0)) byEvent.set(ev, r);
  }
  return [...byEvent.values(), ...singles];
}
