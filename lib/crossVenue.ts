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
  kalshiProb: number; // comparable probability - polarity already applied
  polymarketProb: number; // comparable probability - polarity already applied
  kalshiInverted: boolean; // true iff kalshi's own "yes" is the NEGATION of the proposition
  polymarketInverted: boolean; // true iff polymarket's own "yes" is the NEGATION of the proposition
  divergence: number; // |kalshiProb - polymarketProb|, 0..1, both already polarity-adjusted
}

// "Does this market's own YES correspond to the proposition in `key` being true
// (1) or to its negation (-1)?" Polarity is a property of each MARKET, never of
// the proposition/key: two markets that share a key can disagree on which side
// of the outcome their "yes" represents (e.g. "cuts happen" vs "no cuts
// happen"), and it must stay out of the key or a "yes" market and a "no" market
// on the same outcome could never land in the same bucket to be compared.
export type Polarity = 1 | -1;

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

// "At least one Fed cut by <year>" - a family SEPARATE from the meeting-specific
// hike/cut/hold-by-Nbps propositions above (different key shape, `fed|YYYY|cut|any`
// vs `fed|YYYY-MM|cut|N`, so the two can never collide). It carries polarity
// because its two live phrasings sit on OPPOSITE sides of the outcome: Kalshi's
// "cut rates before <year+1>" markets are themselves "at least one cut", but
// Polymarket has no matching "at least one" market - only a 0..12+ cut-COUNT
// ladder, whose zero rung ("no Fed rate cuts happen in <year>") is the outcome's
// NEGATION, not a restatement of it.
//
// Deliberately narrow: matches these two validated phrasings only, never a
// generic "title contains no/not" rule. A generic negation rule would also fire
// on "Will there be NO change in Fed interest rates..." (a HOLD proposition,
// parsed above, that already correctly pairs with a 0bps market) and steal it
// into this family with the wrong polarity. It also does NOT match the
// count-ladder's other rungs ("1 Fed rate cut happen in 2026", "12 or more Fed
// rate cuts happen in 2026", ...): exactly-N is not the negation of at-least-one,
// only exactly-zero is, and none of those titles contain "no ... cuts happen".
export interface FedAnyCutProposition {
  year: string; // e.g. "2026"
  polarity: Polarity;
}

export function parseFedAnyCutProposition(m: Market): FedAnyCutProposition | null {
  if (m.prob == null) return null;
  if (m.category !== "Rates/Fed") return null;

  const normalized = normalizeBpsPhrasing(m.title.toLowerCase());

  // Same guards as the meeting-specific family: must be the US Federal Reserve -
  // Kalshi's KXCBRATEHIKE series carries the same "raise ... before 2027" shape
  // for the Bank of England, Bank of Canada, RBA, Riksbank, SNB and Norges Bank
  // under this same "Rates/Fed" category, and none of those may share a Fed key -
  // and must not be a narrower, unmodelled qualifier (an emergency cut is not
  // "at least one [scheduled] cut").
  if (!/federal reserve|federal funds|\bfomc\b|\bfed\b/.test(normalized)) return null;
  if (/\becb\b|european central|bank of (japan|england|russia|canada)|\bboj\b|\bboe\b/.test(normalized)) return null;
  if (UNMODELLED_FED_QUALIFIER.test(normalized)) return null;

  // "before <YYYY>" means "during <YYYY-1>": a cut before 2027 is a 2026 cut. It
  // must key to 2026, never to 2027.
  const before = normalized.match(/\bcut(?:s)?\s+rates\s+before\s+(\d{4})\b/);
  if (before) {
    return { year: String(Number(before[1]) - 1), polarity: 1 };
  }

  const none = normalized.match(/\bno\s+fed\s+rate\s+cuts?\s+happen\s+in\s+(\d{4})\b/);
  if (none) {
    return { year: none[1], polarity: -1 };
  }

  return null;
}

function fedAnyCutProposition(m: Market): { prop: Proposition; polarity: Polarity } | null {
  const parsed = parseFedAnyCutProposition(m);
  if (!parsed) return null;
  return {
    prop: {
      type: "fed",
      key: `fed|${parsed.year}|cut|any`,
      label: `At least one Fed cut in ${parsed.year}`,
      action: "cut",
    },
    polarity: parsed.polarity,
  };
}

// Dispatch a market to whichever outcome parser recognises it, else null.
// Add new proposition families here (CPI thresholds, rate-cut counts, shutdowns)
// once validated against live data - each MUST key on the outcome, not tokens.
//
// Polarity-bearing families (currently only `fedAnyCutProposition`) are
// deliberately NOT included here - this dispatcher hands back a bare
// Proposition with no polarity attached, and a polarity-blind consumer (e.g.
// `matchMetaculusToMarkets` in metaculus.ts, which compares raw `prob` values)
// would silently reintroduce the false-pair bug this file guards against, just
// one hop over. `parsePropositionWithPolarity` below is the polarity-aware
// dispatcher and is what `findCrossVenue` uses.
export function parseProposition(m: Market): Proposition | null {
  return fedProposition(m) ?? recessionProposition(m);
}

interface ParsedMarket {
  prop: Proposition;
  polarity: Polarity;
}

function parsePropositionWithPolarity(m: Market): ParsedMarket | null {
  const fed = fedProposition(m);
  if (fed) return { prop: fed, polarity: 1 };
  const recession = recessionProposition(m);
  if (recession) return { prop: recession, polarity: 1 };
  return fedAnyCutProposition(m);
}

function comparableProb(prob: number, polarity: Polarity): number {
  return polarity === -1 ? 1 - prob : prob;
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
  // Polarity is per-MARKET, not per-key (see `Polarity`'s doc comment above), so
  // it is tracked against the specific Market object here and looked up again
  // below once `bestByVolume` has picked the one market per venue per key that
  // actually makes the pair - that market's own polarity is the one that applies.
  const polarityByMarket = new Map<Market, Polarity>();

  for (const m of markets) {
    if (m.platform !== "Kalshi" && m.platform !== "Polymarket") continue;
    const parsed = parsePropositionWithPolarity(m);
    if (!parsed) continue;

    propByKey.set(parsed.prop.key, parsed.prop);
    polarityByMarket.set(m, parsed.polarity);
    const bucket = m.platform === "Kalshi" ? kalshiByKey : polyByKey;
    const list = bucket.get(parsed.prop.key);
    if (list) list.push(m);
    else bucket.set(parsed.prop.key, [m]);
  }

  const pairs: CrossVenuePair[] = [];
  for (const [key, kalshiMarkets] of kalshiByKey) {
    const polyMarkets = polyByKey.get(key);
    if (!polyMarkets || polyMarkets.length === 0) continue;

    const prop = propByKey.get(key)!;
    const kalshi = bestByVolume(kalshiMarkets);
    const polymarket = bestByVolume(polyMarkets);
    const kalshiPolarity = polarityByMarket.get(kalshi) ?? 1;
    const polymarketPolarity = polarityByMarket.get(polymarket) ?? 1;
    const kalshiProb = comparableProb(kalshi.prob as number, kalshiPolarity);
    const polymarketProb = comparableProb(polymarket.prob as number, polymarketPolarity);

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
      kalshiInverted: kalshiPolarity === -1,
      polymarketInverted: polymarketPolarity === -1,
      divergence: Math.abs(kalshiProb - polymarketProb),
    });
  }

  pairs.sort((a, b) => b.divergence - a.divergence);
  return pairs;
}
