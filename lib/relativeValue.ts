import type { Market } from "./types";

// Relative value = LOGICAL consistency checks within a venue, not fuzzy
// correlations. A family of threshold markets ("X above T%") must be monotone in
// T: for "above", a higher threshold can only be LESS likely; for "below", more
// likely. A rung that breaks that ordering is a genuine inconsistency (a real
// arb), not a hunch. We surface the whole implied "strike ladder" (the market's
// implied distribution across thresholds) and flag any rungs that violate it.

export type Direction = "above" | "below";

export interface StrikeMarket {
  market: Market;
  metric: string;
  period: string; // grouping key, "YYYY" or "YYYY-MM"
  threshold: number;
  direction: Direction;
  prob: number;
}

export interface LadderRung {
  threshold: number;
  prob: number;
  id: string;
  title: string;
  violation: boolean; // breaks monotonicity vs the adjacent lower threshold
}

export interface StrikeLadder {
  key: string;
  metric: string;
  period: string;
  direction: Direction;
  rungs: LadderRung[];
  hasViolation: boolean;
  volume: number; // total, for ranking
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function metricOf(t: string): string | null {
  if (/\bcpi\b|inflation/.test(t)) return "CPI inflation";
  if (/unemployment|jobless/.test(t)) return "Unemployment";
  if (/\bgdp\b/.test(t)) return "GDP growth";
  if (/\bwti\b|crude|oil price|per barrel|oil settle/.test(t)) return "Oil price";
  if (/upper bound of the federal funds/.test(t)) return "Fed upper bound";
  if (/lower bound of the federal funds/.test(t)) return "Fed lower bound";
  return null;
}

function directionOf(t: string): Direction | null {
  // ranges ("between X and Y") are not a single-sided threshold - skip them
  if (/\bbetween\b/.test(t)) return null;
  if (/\b(above|over|at least|or higher|reach|exceed|greater than|more than)\b/.test(t)) return "above";
  if (/\b(below|under|or lower|less than)\b/.test(t)) return "below";
  return null;
}

export function parseStrike(m: Market): StrikeMarket | null {
  if (m.prob == null) return null;
  const t = m.title.toLowerCase();
  const metric = metricOf(t);
  if (!metric) return null;
  const direction = directionOf(t);
  if (!direction) return null;
  const pctM = t.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!pctM) return null;
  const threshold = Number(pctM[1]);
  const yearM = t.match(/\b(20\d{2})\b/);
  if (!yearM) return null;
  const year = yearM[1];
  const monthIdx = MONTHS.findIndex((mo) => t.includes(mo));
  const period = monthIdx >= 0 ? `${year}-${String(monthIdx + 1).padStart(2, "0")}` : year;
  return { market: m, metric, period, threshold, direction, prob: m.prob };
}

// Build one ladder per (metric, period, direction) family that has at least
// `minRungs` distinct thresholds. Rungs are sorted by threshold; each is flagged
// if it breaks monotonicity relative to the adjacent lower rung.
// eps = 3pp: below this, an adjacent inversion is within typical bid-ask /
// rounding / staleness noise on fine-grained (0.1%-apart) ladders and would cry
// wolf. Validated on live data - only inversions >=3pp are materially real.
export function buildStrikeLadders(markets: Market[], minRungs = 3, eps = 0.03): StrikeLadder[] {
  const strikes = markets.map(parseStrike).filter((s): s is StrikeMarket => s != null);

  const groups = new Map<string, StrikeMarket[]>();
  for (const s of strikes) {
    const k = `${s.metric}|${s.period}|${s.direction}`;
    const list = groups.get(k);
    if (list) list.push(s);
    else groups.set(k, [s]);
  }

  const ladders: StrikeLadder[] = [];
  for (const [key, arr] of groups) {
    // one rung per distinct threshold (highest-volume market wins ties)
    const byThreshold = new Map<number, StrikeMarket>();
    for (const s of arr) {
      const cur = byThreshold.get(s.threshold);
      if (!cur || s.market.volume > cur.market.volume) byThreshold.set(s.threshold, s);
    }
    if (byThreshold.size < minRungs) continue;

    const sorted = [...byThreshold.values()].sort((a, b) => a.threshold - b.threshold);
    const direction = sorted[0].direction;
    let hasViolation = false;
    const rungs: LadderRung[] = sorted.map((s, i) => {
      let violation = false;
      if (i > 0) {
        const prev = sorted[i - 1];
        violation = direction === "above" ? s.prob - prev.prob > eps : prev.prob - s.prob > eps;
      }
      if (violation) hasViolation = true;
      return { threshold: s.threshold, prob: s.prob, id: s.market.id, title: s.market.title, violation };
    });

    ladders.push({
      key,
      metric: sorted[0].metric,
      period: sorted[0].period,
      direction,
      rungs,
      hasViolation,
      volume: sorted.reduce((v, s) => v + s.market.volume, 0),
    });
  }

  // violations first, then by liquidity
  ladders.sort((a, b) => Number(b.hasViolation) - Number(a.hasViolation) || b.volume - a.volume);
  return ladders;
}
