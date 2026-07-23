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

// ---- resolution-window grouping --------------------------------------------

export type WindowKey = "week" | "month" | "quarter" | "long";

export interface BoardWindow {
  key: WindowKey;
  label: string;
  sublabel: string;
  markets: Market[];
}

const WINDOW_META: Record<WindowKey, { label: string; sublabel: string }> = {
  week: { label: "This week", sublabel: "resolving in 0-7 days" },
  month: { label: "This month", sublabel: "resolving in 8-31 days" },
  quarter: { label: "This quarter", sublabel: "resolving in 32-180 days" },
  long: { label: "Long-dated", sublabel: "6+ months out or undated - lower near-term signal" },
};
const WINDOW_ORDER: WindowKey[] = ["week", "month", "quarter", "long"];

// Which resolution window a days-to-resolution value falls in. Undated or
// already-past markets (days null or < 0) sink to "long" so stale/novelty markets
// (e.g. 2028 election bets, ~838 days out; past-quarter buckets kept open) never
// lead the board.
export function resolutionWindowKey(days: number | null): WindowKey {
  if (days == null || days < 0) return "long";
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  if (days <= 180) return "quarter";
  return "long";
}

function daysUntil(endDate: string, nowMs: number): number | null {
  const t = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const d = new Date(nowMs);
  const t0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((t - t0) / 86_400_000);
}

// Group markets into ordered resolution windows (This week -> Long-dated), each
// sorted by volume desc. nowMs is injectable for deterministic tests. This is the
// board's primary axis: near-term macro leads, long-dated novelty sinks.
export function groupByWindow(markets: Market[], nowMs: number = Date.now()): BoardWindow[] {
  const byKey = new Map<WindowKey, Market[]>();
  for (const m of markets) {
    const key = resolutionWindowKey(daysUntil(m.endDate, nowMs));
    const list = byKey.get(key);
    if (list) list.push(m);
    else byKey.set(key, [m]);
  }
  return WINDOW_ORDER.filter((k) => byKey.has(k)).map((k) => ({
    key: k,
    ...WINDOW_META[k],
    markets: byKey.get(k)!.sort((a, b) => (b.volume || 0) - (a.volume || 0)),
  }));
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
