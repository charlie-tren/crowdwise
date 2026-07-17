import type { Market } from "./types";

export type FedAction = "hike" | "cut" | "hold";

export interface FedProposition {
  ym: string; // meeting year-month "YYYY-MM" (from endDate)
  action: FedAction;
  bps: number; // basis points; 0 for hold; parsed number (25, 50); -1 for ">N" open-ended buckets
}

export interface CrossVenuePair {
  ym: string;
  action: FedAction;
  bps: number;
  label: string; // human proposition, e.g. "Hold at the 2026-07 meeting"
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

const BPS_RE = /(>|more than|at least)?\s*(\d+(?:\.\d+)?)bps/i;

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

  return { ym, action, bps };
}

function makeLabel(ym: string, action: FedAction, bps: number): string {
  if (action === "hold") return `Hold at the ${ym} meeting`;
  if (bps === -1) return `${actionLabel(action)} >… at the ${ym} meeting`;
  return `${actionLabel(action)} ${bps}bps at the ${ym} meeting`;
}

function bestByVolume(markets: Market[]): Market {
  return markets.reduce((best, m) => (m.volume > best.volume ? m : best));
}

// Match Kalshi <-> Polymarket Fed markets that share the SAME proposition
// (ym + action + bps), returning the cross-venue price pairs sorted by divergence desc.
export function findCrossVenue(markets: Market[]): CrossVenuePair[] {
  const kalshiByKey = new Map<string, Market[]>();
  const polyByKey = new Map<string, Market[]>();
  const propByKey = new Map<string, FedProposition>();

  for (const m of markets) {
    if (m.platform !== "Kalshi" && m.platform !== "Polymarket") continue;
    const prop = parseFedProposition(m);
    if (!prop) continue;

    const key = `${prop.ym}|${prop.action}|${prop.bps}`;
    propByKey.set(key, prop);
    const bucket = m.platform === "Kalshi" ? kalshiByKey : polyByKey;
    const list = bucket.get(key);
    if (list) list.push(m);
    else bucket.set(key, [m]);
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
      ym: prop.ym,
      action: prop.action,
      bps: prop.bps,
      label: makeLabel(prop.ym, prop.action, prop.bps),
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
