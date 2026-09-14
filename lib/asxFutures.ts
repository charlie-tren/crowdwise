// ASX 30 Day Interbank Cash Rate Futures - the RBA's equivalent of the OIS/SOFR
// curve the Atlanta Fed tracker gives for the Fed. Free JSON, no key, ~18 monthly
// contracts out about eighteen months.
//
// The contract settles on the average RBA cash rate over the delivery month and is
// quoted as 100 minus that rate, so the implied cash rate is simply 100 - price.
// Validated 14/09/2026: the front contract implied 4.358% against an RBA cash rate
// of 4.35% read off Bloomberg's RBACTRD the same week, which is the sanity check
// that the convention is the right way up.
//
// Why this matters for the site: Kalshi lists exactly ONE RBA market, a single
// binary on whether the Bank raises before 2027. That cannot produce a crowd-implied
// PATH, so the Fed chart cannot be copied for Australia. What it can produce is the
// other half - a real-money comparator for that one binary.

export const ASX_IB_FUTURES_URL =
  "https://asx.api.markitdigital.com/asx-research/1.0/derivatives/interest-rate/IB/futures?days=1&height=179&width=179";

export interface AsxContract {
  /** Contract expiry, ISO date. */
  expiry: string;
  /** Implied RBA cash rate over the delivery month, in percent. */
  impliedPct: number;
}

export interface AsxPath {
  /** Front contract: the market's read on the cash rate right now, in percent. */
  currentPct: number;
  contracts: AsxContract[];
}

interface RawItem {
  dateExpiry?: string;
  priceAsk?: number;
  priceBid?: number;
  pricePreviousSettlement?: number;
}

// A mid of bid and ask where both are present. Some back contracts are illiquid and
// quote one side only or neither, in which case the previous settlement is the
// honest fallback - a one-sided quote is not a price.
function midPrice(it: RawItem): number | null {
  const { priceBid: bid, priceAsk: ask, pricePreviousSettlement: prev } = it;
  if (typeof bid === "number" && typeof ask === "number" && bid > 0 && ask > 0) {
    return (bid + ask) / 2;
  }
  if (typeof prev === "number" && prev > 0) return prev;
  return null;
}

export function parseAsxFutures(json: unknown): AsxPath | null {
  const items = (json as { data?: { items?: RawItem[] } })?.data?.items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const contracts: AsxContract[] = [];
  for (const it of items) {
    const price = midPrice(it);
    if (!it.dateExpiry || price === null) continue;
    const impliedPct = 100 - price;
    // A quoted IB future outside 0-20% is a parse fault, not a rate. Refuse it
    // rather than publishing a number that would silently distort the comparison.
    if (!Number.isFinite(impliedPct) || impliedPct < 0 || impliedPct > 20) continue;
    contracts.push({ expiry: it.dateExpiry, impliedPct });
  }
  if (contracts.length < 2) return null;
  contracts.sort((a, b) => a.expiry.localeCompare(b.expiry));
  return { currentPct: contracts[0].impliedPct, contracts };
}

/**
 * Basis points the curve prices between now and the last contract expiring on or
 * before `byISO`. Positive means hikes are priced.
 *
 * Returns null when no contract reaches that far, rather than extrapolating: the
 * whole point of the comparator is that it is a real quoted price.
 */
export function bpsPricedBy(path: AsxPath, byISO: string): number | null {
  const reachable = path.contracts.filter((c) => c.expiry <= byISO);
  if (reachable.length === 0) return null;
  const last = reachable[reachable.length - 1];
  return Math.round((last.impliedPct - path.currentPct) * 100);
}

export async function fetchAsxPath(
  fetchJson: (url: string) => Promise<unknown> = defaultFetchJson,
): Promise<AsxPath | null> {
  try {
    return parseAsxFutures(await fetchJson(ASX_IB_FUTURES_URL));
  } catch {
    // Best-effort, exactly like the Atlanta Fed loader: a failure leaves the row
    // crowd-only rather than taking the panel down.
    return null;
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "crowdwise (charlietrenorden.com)" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`ASX ${res.status}`);
  return res.json();
}
