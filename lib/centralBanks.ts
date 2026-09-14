import type { Market } from "./types";

// Kalshi's KXCBRATEHIKE series: one binary per central bank, "will they raise
// before 2027?". Seven banks, all already on the board, so the crowd half of this
// panel costs no new data.
//
// WHY THIS PANEL EXISTS RATHER THAN AN RBA COPY OF THE FED ONE. The Fed panel needs
// a per-meeting outcome ladder (cut/hold/hike) and a crowd-implied PATH. Checked
// 14/09/2026: the Fed has ~200 such markets across both venues; the RBA has this
// one binary and nothing else on either. One binary is one number, not a path, so
// neither half of that panel can be reproduced. What CAN be reproduced is its
// actual idea - a real-money comparator beside the crowd, with the gap as the
// finding - cut across banks instead of across time.

export const CB_SERIES = "KXCBRATEHIKE";

/** Ticker suffix -> display name. Kalshi's own titles are long and repetitive. */
const BANKS: Record<string, string> = {
  FED: "Federal Reserve",
  BOE: "Bank of England",
  BOC: "Bank of Canada",
  RBA: "Reserve Bank of Australia",
  SNB: "Swiss National Bank",
  NOR: "Norges Bank",
  RIK: "Riksbank",
};

export interface CentralBankRow {
  code: string;
  bank: string;
  /** Crowd probability of a hike before 2027, 0-1. */
  prob: number;
  volume: number;
  /**
   * Basis points the bank's own futures curve prices by end-2026, where a free
   * curve exists. NOT a probability and deliberately not converted into one: a
   * curve gives an expected path, and turning that into P(at least one hike) needs
   * a distributional assumption that would be invented rather than measured.
   */
  futuresBps: number | null;
  /** What the futures figure is sourced from, for the footer. Null when absent. */
  futuresSource: string | null;
}

function suffix(id: string): string {
  const parts = id.split("-");
  return parts[parts.length - 1]?.toUpperCase() ?? "";
}

export interface FuturesComparators {
  /** code -> bps priced by end-2026 */
  bps: Record<string, number>;
  /** code -> source label */
  source: Record<string, string>;
}

export function centralBankRows(
  markets: Market[],
  comparators: FuturesComparators = { bps: {}, source: {} },
): CentralBankRow[] {
  const rows: CentralBankRow[] = [];
  for (const m of markets) {
    if (m.series !== CB_SERIES) continue;
    if (m.prob === null || !Number.isFinite(m.prob)) continue;
    const code = suffix(m.id);
    const bank = BANKS[code];
    if (!bank) continue; // an eighth bank added upstream shows up as a gap, not a wrong label
    rows.push({
      code,
      bank,
      prob: m.prob,
      volume: m.volume,
      futuresBps: comparators.bps[code] ?? null,
      futuresSource: comparators.source[code] ?? null,
    });
  }
  // Most-likely first. The interesting rows are the extremes, and a reader scanning
  // from the top should meet the banks the crowd is most confident about.
  rows.sort((a, b) => b.prob - a.prob);
  return rows;
}

/**
 * Rows where the crowd and the futures curve disagree enough to be worth naming.
 *
 * The two are in different units, so "disagreement" is a direction test rather than
 * a difference: futures pricing a full hike or more while the crowd is under 80%,
 * or futures pricing nothing while the crowd is over 20%. Anything subtler than
 * that is not something these two measures can settle between them.
 */
export function disagreements(rows: CentralBankRow[]): CentralBankRow[] {
  return rows.filter((r) => {
    if (r.futuresBps === null) return false;
    if (r.futuresBps >= 25 && r.prob < 0.8) return true;
    if (r.futuresBps <= 0 && r.prob > 0.2) return true;
    return false;
  });
}

/**
 * Basis points the Atlanta Fed's futures path prices by `byISO`, so the Fed row
 * carries the same unit as the ASX-derived RBA row.
 *
 * Kept here beside the ASX equivalent rather than in fedFutures.ts, because the
 * only reason it exists is to make the two comparable: the Fed panel above uses
 * the same path for a cumulative-change chart, which is a different question.
 */
export function fedBpsPricedBy(
  path: { currentRatePct: number; points: Array<{ refStartTs: number; meanPct: number }> },
  byISO: string,
): number | null {
  const cutoff = Date.parse(`${byISO}T00:00:00Z`);
  if (!Number.isFinite(cutoff)) return null;
  const reachable = path.points
    .filter((p) => p.refStartTs <= cutoff)
    .sort((a, b) => a.refStartTs - b.refStartTs);
  if (reachable.length === 0) return null;
  const last = reachable[reachable.length - 1];
  return Math.round((last.meanPct - path.currentRatePct) * 100);
}
