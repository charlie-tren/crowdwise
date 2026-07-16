import { CATEGORIES } from "./taxonomy";
import type { Market, Snapshot, HistoryPoint } from "./types";

export function computeMoves(records: Array<{ id: string; prob: number | null }>, history: Snapshot[]): Record<string, number> {
  if (!history.length) return {};
  const prev = history[history.length - 1].probs ?? {};
  const moves: Record<string, number> = {};
  for (const r of records) {
    if (r.id == null || r.prob == null) continue;
    const before = prev[r.id];
    if (before == null) continue;
    moves[r.id] = r.prob - before;
  }
  return moves;
}

export function historyMove(points: HistoryPoint[]): number | null {
  if (!points || points.length < 2) return null;
  return points[points.length - 1][1] - points[0][1];
}

export function topMovers(records: Market[], moves: Record<string, number>, n = 10): Array<Market & { move: number }> {
  const out = records.filter((r) => r.id in moves).map((r) => ({ ...r, move: moves[r.id] }));
  out.sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
  return out.slice(0, Math.max(0, n));
}

export interface ThemeConviction { category: string; weightedProb: number; count: number; volume: number; }

export function themeConviction(records: Market[]): ThemeConviction[] {
  const out: ThemeConviction[] = [];
  for (const cat of CATEGORIES) {
    const members = records.filter((r) => r.category === cat && r.prob != null);
    if (!members.length) continue;
    const vols = members.map((r) => Math.max(0, r.volume || 0));
    const totalVol = vols.reduce((a, b) => a + b, 0);
    const weighted = totalVol > 0
      ? members.reduce((acc, r, i) => acc + (r.prob as number) * vols[i], 0) / totalVol
      : members.reduce((acc, r) => acc + (r.prob as number), 0) / members.length;
    out.push({ category: cat, weightedProb: weighted, count: members.length, volume: totalVol });
  }
  return out;
}

export function marketProbSeries(history: Snapshot[], ids?: string[]): Record<string, HistoryPoint[]> {
  const want = ids ? new Set(ids) : null;
  const series: Record<string, HistoryPoint[]> = {};
  for (const snap of history) {
    const ts = snap.ts;
    if (!ts) continue;
    for (const [mid, p] of Object.entries(snap.probs ?? {})) {
      if (want && !want.has(mid)) continue;
      if (p == null) continue;
      (series[mid] ??= []).push([ts, p]);
    }
  }
  return series;
}
