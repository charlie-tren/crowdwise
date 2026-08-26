import type { Market } from "./types";

export type FedAction = "hike" | "cut" | "hold";

export interface FedProposition {
  ym: string; // meeting year-month "YYYY-MM" (from endDate)
  action: FedAction;
  bps: number; // basis points; 0 for hold; parsed number (25, 50); -1 for ">N" open-ended buckets
  /**
   * The N in a ">N bps" bucket. DISPLAY ONLY - deliberately kept out of `bps`
   * and therefore out of the proposition key, so cross-venue matching is
   * unchanged. Without it every open-ended bucket rendered as "Fed hikes at the
   * Sep 2026 meeting", which reads as "does the Fed hike at all" when the market
   * is actually "does it hike by MORE than 25bps" - a different question, and it
   * sat on the timeline directly beside the exact-25bps market.
   */
  openEndedFromBps?: number;
}

// A canonical, venue-agnostic proposition. Two markets on different venues match
// iff they parse to the SAME `key`. Match on the OUTCOME, never on title tokens -
// that is what stops the old false-arb (a hike paired with a hold). `type`/`key`/
// `label` are generic; the fed-* fields are populated only for Fed propositions
// so existing Fed-specific rendering/tests keep working.
export interface Proposition {
  type: "fed" | "recession";
  key: string;
  label: string; // human proposition, e.g. "Hold at the 2026-07 meeting"
  ym?: string;
  action?: FedAction;
  bps?: number;
}

export interface CrossVenuePair {
  type: string;
  key: string;
  label: string;
  ym?: string;
  action?: FedAction;
  bps?: number;
  kalshi: Market;
  polymarket: Market;
  kalshiProb: number;
  polymarketProb: number;
  divergence: number; // |kalshiProb - polymarketProb|, 0..1
}

// Collapse "25 bps" / "25bp" / "25 basis points" (any spacing) into a
// consistent "25bps" token so downstream regexes only need one shape.
function normalizeBpsPhrasing(title: string): string {
  return title.replace(
    /(\d+(?:\.\d+)?)\s*(?:bps|bp|basis points)\b/gi,
    "$1bps",
  );
}

// A qualifier that NARROWS a Fed proposition in a way none of the canonical
// phrasings model. Canonicalising past one of these mislabels the market:
// "Fed emergency rate cut before 2027?" rendered as "Fed cuts rates before 2027",
// a far broader claim, and sat on the timeline beside the real any-cut market
// priced 6.6pp away, so the pair read as one row duplicated with a pricing bug.
// When we cannot say it faithfully, keep the venue's own wording.
export const UNMODELLED_FED_QUALIFIER =
  /\b(emergency|unscheduled|inter-?meeting|off-cycle|surprise|consecutive)\b/i;

const BPS_RE =/(>|more than|at least)?\s*(\d+(?:\.\d+)?)bps/i;

function actionLabel(action: FedAction): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

// Parse a Fed-decision market title into a canonical proposition, or null if it
// isn't a cleanly-parseable Fed hike/cut/hold-by-Nbps market.
export function parseFedProposition(m: Market): FedProposition | null {
  if (m.prob == null) return null;
  if (!m.endDate) return null;
  if (m.category !== "Rates/Fed") return null;

  const ym = m.endDate.slice(0, 7);
  if (ym.length !== 7) return null;

  const normalized = normalizeBpsPhrasing(m.title.toLowerCase());

  // Must be the US Federal Reserve. The board's Rates/Fed theme also carries
  // ECB / Bank of Japan / Bank of Russia decision markets (same category, same
  // "25bps increase July 2026" shape), which would otherwise share a proposition
  // key with a Fed market and produce a false cross-venue pair / corrupt the Fed
  // distribution.
  if (!/federal reserve|federal funds|\bfomc\b|\bfed\b/.test(normalized)) return null;
  if (/\becb\b|european central|bank of (japan|england|russia|canada)|\bboj\b|\bboe\b/.test(normalized)) return null;
  // An emergency / intermeeting move is not the scheduled decision, so it must not
  // share a proposition key with one or feed the meeting distribution.
  if (UNMODELLED_FED_QUALIFIER.test(normalized)) return null;

  const isHold = normalized.includes("no change") || /\b0bps\b/.test(normalized);

  let action: FedAction;
  if (isHold) {
    action = "hold";
  } else if (normalized.includes("hike") || normalized.includes("increase")) {
    action = "hike";
  } else if (
    normalized.includes("cut") ||
    normalized.includes("decrease") ||
    normalized.includes("lower")
  ) {
    action = "cut";
  } else {
    return null;
  }

  if (action === "hold") {
    return { ym, action, bps: 0 };
  }

  const bpsMatch = normalized.match(BPS_RE);
  if (!bpsMatch) return null;

  const isOpenEnded = Boolean(bpsMatch[1]);
  const bps = isOpenEnded ? -1 : Number(bpsMatch[2]);

  return isOpenEnded
    ? { ym, action, bps, openEndedFromBps: Number(bpsMatch[2]) }
    : { ym, action, bps };
}

function makeFedLabel(ym: string, action: FedAction, bps: number, fromBps?: number): string {
  if (action === "hold") return `Hold at the ${ym} meeting`;
  if (bps === -1) return `${actionLabel(action)} >${fromBps ?? "…"}bps at the ${ym} meeting`;
  return `${actionLabel(action)} ${bps}bps at the ${ym} meeting`;
}

function fedProposition(m: Market): Proposition | null {
  const fed = parseFedProposition(m);
  if (!fed) return null;
  return {
    type: "fed",
    key: `fed|${fed.ym}|${fed.action}|${fed.bps}`,
    label: makeFedLabel(fed.ym, fed.action, fed.bps, fed.openEndedFromBps),
    ym: fed.ym,
    action: fed.action,
    bps: fed.bps,
  };
}

// Parse a recession market ("US recession in 2026", "recession in Q3 2026")
// into a canonical proposition. Granularity is baked into the key: an annual
// market and a quarterly market get DIFFERENT keys, so a Polymarket "recession
// in 2026" never falsely pairs with a Kalshi "recession in Q3 2026" - they are
// genuinely different propositions. Needs an explicit year token to parse.
function recessionProposition(m: Market): Proposition | null {
  if (m.prob == null) return null;
  if (m.category !== "Growth/Recession") return null;

  const t = m.title.toLowerCase();
  if (!t.includes("recession")) return null;

  // US recession only - a "Japan recession in 2026" must not share a key with a
  // US recession market on the other venue.
  if (!/\bu\.?s\.?\b|\bunited states\b|\bamerican\b/.test(t)) return null;

  const yearMatch = t.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = yearMatch[1];

  const qMatch =
    t.match(/\bq([1-4])\b/) ||
    t.match(/\b([1-4])(?:st|nd|rd|th)\s+quarter\b/);
  const quarter = qMatch ? qMatch[1] : null;

  if (quarter) {
    return {
      type: "recession",
      key: `recession|${year}|q${quarter}`,
      label: `US recession in Q${quarter} ${year}`,
    };
  }
  return {
    type: "recession",
    key: `recession|${year}`,
    label: `US recession in ${year}`,
  };
}

// Dispatch a market to whichever outcome parser recognises it, else null.
// Add new proposition families here (CPI thresholds, rate-cut counts, shutdowns)
// once validated against live data - each MUST key on the outcome, not tokens.
export function parseProposition(m: Market): Proposition | null {
  return fedProposition(m) ?? recessionProposition(m);
}

function bestByVolume(markets: Market[]): Market {
  return markets.reduce((best, m) => (m.volume > best.volume ? m : best));
}

// Match Kalshi <-> Polymarket markets that share the SAME proposition key,
// returning the cross-venue price pairs sorted by divergence desc.
export function findCrossVenue(markets: Market[]): CrossVenuePair[] {
  const kalshiByKey = new Map<string, Market[]>();
  const polyByKey = new Map<string, Market[]>();
  const propByKey = new Map<string, Proposition>();

  for (const m of markets) {
    if (m.platform !== "Kalshi" && m.platform !== "Polymarket") continue;
    const prop = parseProposition(m);
    if (!prop) continue;

    propByKey.set(prop.key, prop);
    const bucket = m.platform === "Kalshi" ? kalshiByKey : polyByKey;
    const list = bucket.get(prop.key);
    if (list) list.push(m);
    else bucket.set(prop.key, [m]);
  }

  const pairs: CrossVenuePair[] = [];
  for (const [key, kalshiMarkets] of kalshiByKey) {
    const polyMarkets = polyByKey.get(key);
    if (!polyMarkets || polyMarkets.length === 0) continue;

    const prop = propByKey.get(key)!;
    const kalshi = bestByVolume(kalshiMarkets);
    const polymarket = bestByVolume(polyMarkets);
    const kalshiProb = kalshi.prob as number;
    const polymarketProb = polymarket.prob as number;

    pairs.push({
      type: prop.type,
      key: prop.key,
      label: prop.label,
      ym: prop.ym,
      action: prop.action,
      bps: prop.bps,
      kalshi,
      polymarket,
      kalshiProb,
      polymarketProb,
      divergence: Math.abs(kalshiProb - polymarketProb),
    });
  }

  pairs.sort((a, b) => b.divergence - a.divergence);
  return pairs;
}
