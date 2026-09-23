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
  id: string; // Kalshi market ticker
  series: string; // Kalshi series ticker - needed to fetch this rung's candlestick history
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
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function metricOf(t: string): string | null {
  if (/\bcpi\b|inflation/.test(t)) return "CPI inflation";
  if (/unemployment|jobless/.test(t)) return "Unemployment";
  if (/\bgdp\b/.test(t)) return "GDP growth";
  // Production (a flow, barrels/day) and reserves (a stock, barrels) are a
  // different QUANTITY to a settlement PRICE (dollars/barrel) - a ladder mixing
  // them would fabricate a monotonicity violation out of unrelated units.
  // Excluded rather than given their own metric bucket: today's board has one
  // of each, nowhere near minRungs, so they can't form a real ladder either way.
  if (/crude oil production|oil production|crude oil reserves|oil reserves|barrels per day|\bbpd\b/.test(t)) return null;
  if (/\bwti\b|crude|oil price|per barrel|oil settle/.test(t)) return "Oil price";
  if (/upper bound of the federal funds/.test(t)) return "Fed upper bound";
  if (/lower bound of the federal funds/.test(t)) return "Fed lower bound";
  return null;
}

const ABOVE_WORDS = "above|over|at least|or higher|reach|exceed|greater than|more than";
const BELOW_WORDS = "below|under|or lower|less than";
const COMPARATOR_RE = new RegExp(`(>|<|\\b(?:${ABOVE_WORDS})\\b|\\b(?:${BELOW_WORDS})\\b)`);
const ABOVE_TOKEN_RE = new RegExp(`^(?:${ABOVE_WORDS})$`);

// Finds the comparator (symbol or word) and where it starts/ends in the title,
// so the threshold can be anchored to it rather than picked as the first
// number anywhere in the string (which would just as happily grab the
// day-of-month or the year off the end of the title). "or higher"/"or lower"
// read BACKWARDS ("9% or higher") - the threshold precedes the comparator
// there, not follows it - so that pair is flagged for the caller.
function directionOf(t: string): { direction: Direction; start: number; end: number; backward: boolean } | null {
  // ranges ("between X and Y") are not a single-sided threshold - skip them
  if (/\bbetween\b/.test(t)) return null;
  const cm = t.match(COMPARATOR_RE);
  if (!cm) return null;
  const token = cm[0];
  const start = cm.index ?? 0;
  const end = start + token.length;
  const direction: Direction = token === ">" || ABOVE_TOKEN_RE.test(token) ? "above" : "below";
  const backward = token === "or higher" || token === "or lower";
  return { direction, start, end, backward };
}

// The threshold is the first number found immediately AFTER the comparator
// ends - never a bare scan of the whole title. Percentage titles keep their
// exact prior behaviour (351 live markets depend on this path); anything else
// (a dollar price, a plain number, a USD/Bbl figure) falls through to a
// general number.
function parseThreshold(t: string, from: number): number | null {
  const rest = t.slice(from);
  const pctM = rest.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctM) return Number(pctM[1]);
  const numM = rest.match(/\$?\s*(\d+(?:\.\d+)?)/);
  return numM ? Number(numM[1]) : null;
}

// For the backward "X% or higher"/"X% or lower" phrasing, the threshold is the
// number immediately BEFORE the comparator - anchored to the end of the
// prefix, so an earlier unrelated number in the title (a year) is never picked
// up in its place.
function parseThresholdBefore(t: string, upto: number): number | null {
  const prefix = t.slice(0, upto);
  const m = prefix.match(/(\d+(?:\.\d+)?)\s*%?\s*$/);
  return m ? Number(m[1]) : null;
}

// A "Month Day, Year" date in the title (an oil settlement date, a Fed meeting
// date) is a sharper grouping key than year-or-year-month: several distinct
// dates can share a year, or even a month - this board has three different WTI
// settlement dates, all in 2026 - and merging them would splice unrelated
// strike families into one fake ladder. Matches abbreviated ("Nov 3") or full
// ("November 3") month names; falls back to the coarser year/year-month key
// when no day is present (CPI/GDP/Unemployment titles read "...in July 2026").
function periodOf(t: string): string | null {
  const dateM = t.match(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (dateM) {
    const abbrIdx = MONTH_ABBR.findIndex((mo) => dateM[1].startsWith(mo));
    if (abbrIdx >= 0) {
      const day = dateM[2].padStart(2, "0");
      return `${dateM[3]}-${String(abbrIdx + 1).padStart(2, "0")}-${day}`;
    }
  }
  const yearM = t.match(/\b(20\d{2})\b/);
  if (!yearM) return null;
  const year = yearM[1];
  const monthIdx = MONTHS.findIndex((mo) => t.includes(mo));
  return monthIdx >= 0 ? `${year}-${String(monthIdx + 1).padStart(2, "0")}` : year;
}

export function parseStrike(m: Market): StrikeMarket | null {
  if (m.prob == null) return null;
  const t = m.title.toLowerCase();
  const metric = metricOf(t);
  if (!metric) return null;
  const comparator = directionOf(t);
  if (!comparator) return null;
  const threshold = comparator.backward
    ? parseThresholdBefore(t, comparator.start)
    : parseThreshold(t, comparator.end);
  if (threshold == null) return null;
  const period = periodOf(t);
  if (!period) return null;
  return { market: m, metric, period, threshold, direction: comparator.direction, prob: m.prob };
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
      return { threshold: s.threshold, prob: s.prob, id: s.market.id, series: s.market.series, title: s.market.title, violation };
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
