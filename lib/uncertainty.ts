import type { Market } from "./types";

export interface UncertaintyResult {
  /** Volume-weighted "contestedness", clamped to [0,1]. 1 = the whole board sits at 50/50. */
  index: number;
  /** Number of markets that contributed (prob != null and volume > 0). */
  count: number;
}

/**
 * Volume-weighted market-uncertainty index.
 *
 * For each market with a probability and positive volume, its "contestedness" is
 * `1 - 2·|prob - 0.5|` - so a market at 50% contributes 1 (maximally contested)
 * and one at 0% or 100% contributes 0 (fully resolved in the crowd's mind).
 * The index is the volume-weighted mean of that contestedness, clamped to [0,1].
 */
export function uncertaintyIndex(markets: Market[]): UncertaintyResult {
  let weighted = 0;
  let totalVolume = 0;
  let count = 0;

  for (const m of markets) {
    if (m.prob == null || m.volume <= 0) continue;
    const contested = 1 - 2 * Math.abs(m.prob - 0.5);
    weighted += m.volume * contested;
    totalVolume += m.volume;
    count += 1;
  }

  if (totalVolume <= 0) return { index: 0, count: 0 };

  const index = Math.max(0, Math.min(1, weighted / totalVolume));
  return { index, count };
}
