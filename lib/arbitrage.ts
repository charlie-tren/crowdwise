import type { Market } from "./types";

export interface Discrepancy {
  kalshi: Market;
  polymarket: Market;
  spread: number; // absolute prob difference |kProb - pProb|, 0..1
  score: number; // match-confidence 0..1
}

const STOPWORDS = new Set([
  "will", "the", "be", "a", "an", "of", "in", "on", "to", "by", "at", "for",
  "and", "or", "is", "are", "following", "after", "before", "than", "above",
  "below", "between", "reach", "hit", "close", "end", "year", "market",
  "meeting", "price", "rate",
  // additional articles/preposition/boilerplate noise
  "this", "that", "these", "those", "it", "its", "as", "with", "from", "into",
  "over", "under", "up", "down", "does", "do", "did", "has", "have", "had",
  "if", "when", "what", "which", "who", "there", "yes", "no",
]);

const NUMERIC_RE = /\d+(?:\.\d+)?%|\d+\s?bps|\b\d{4}\b|\b\d+(?:\.\d+)?\b/gi;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// lowercase, strip punctuation, split on whitespace, drop stopwords/filler.
// Numbers, %, and bps figures are meaningful and kept.
export function tokenise(title: string): string[] {
  const cleaned = title
    .toLowerCase()
    .replace(/[^\w\s%]/g, " ") // strip punctuation but keep % attached to digits
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(" ")
    .filter((tok) => tok.length > 0 && !STOPWORDS.has(tok));
}

function numericTokens(title: string): Set<string> {
  const matches = title.match(NUMERIC_RE) ?? [];
  return new Set(matches.map((s) => s.toLowerCase().replace(/\s+/g, "")));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) if (b.has(tok)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function daysBetween(a: string, b: string): number | null {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

export function findDiscrepancies(
  markets: Market[],
  opts?: { minSpread?: number; minScore?: number; maxDays?: number },
): Discrepancy[] {
  const minSpread = opts?.minSpread ?? 0.05;
  const minScore = opts?.minScore ?? 0.55;
  const maxDays = opts?.maxDays ?? 21;

  const kalshi = markets.filter(
    (mkt) => mkt.platform === "Kalshi" && mkt.prob != null && mkt.title.trim().length > 0,
  );
  const poly = markets.filter(
    (mkt) => mkt.platform === "Polymarket" && mkt.prob != null && mkt.title.trim().length > 0,
  );

  const kTokens = new Map<string, Set<string>>();
  const kNumeric = new Map<string, Set<string>>();
  for (const k of kalshi) {
    kTokens.set(k.id, new Set(tokenise(k.title)));
    kNumeric.set(k.id, numericTokens(k.title));
  }
  const pTokens = new Map<string, Set<string>>();
  const pNumeric = new Map<string, Set<string>>();
  for (const p of poly) {
    pTokens.set(p.id, new Set(tokenise(p.title)));
    pNumeric.set(p.id, numericTokens(p.title));
  }

  const candidates: Discrepancy[] = [];

  for (const k of kalshi) {
    for (const p of poly) {
      if (k.category !== p.category) continue;

      let dateCloseness = 0;
      if (k.endDate && p.endDate) {
        const days = daysBetween(k.endDate, p.endDate);
        if (days == null) continue;
        if (days > maxDays) continue;
        dateCloseness = Math.max(0, 1 - days / maxDays);
      }

      const jac = jaccard(kTokens.get(k.id)!, pTokens.get(p.id)!);
      const numJac = jaccard(kNumeric.get(k.id)!, pNumeric.get(p.id)!);
      const score = clamp01(0.7 * jac + 0.2 * numJac + 0.1 * dateCloseness);

      if (score < minScore) continue;
      const spread = Math.abs((k.prob as number) - (p.prob as number));
      if (spread < minSpread) continue;

      candidates.push({ kalshi: k, polymarket: p, spread, score });
    }
  }

  // Greedy dedup by score: at most one Discrepancy per Kalshi market and per
  // Polymarket market (a single Polymarket binary can spuriously match many
  // Kalshi strike contracts, and vice versa).
  candidates.sort((a, b) => b.score - a.score);
  const usedKalshi = new Set<string>();
  const usedPoly = new Set<string>();
  const deduped: Discrepancy[] = [];
  for (const c of candidates) {
    if (usedKalshi.has(c.kalshi.id) || usedPoly.has(c.polymarket.id)) continue;
    usedKalshi.add(c.kalshi.id);
    usedPoly.add(c.polymarket.id);
    deduped.push(c);
  }

  deduped.sort((a, b) => b.spread - a.spread);
  return deduped;
}
