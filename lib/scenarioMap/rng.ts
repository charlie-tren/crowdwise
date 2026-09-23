// A SEEDED generator, not Math.random, so a map always draws the same numbers.
// Without this the percentiles shift by a few tenths on every re-render and a
// reader watching a figure twitch reads it as the market moving.

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Inverse-CDF sample from a triangular distribution over (low, likely, high),
 * given one uniform draw `u`. Triangular because it is the distribution a person
 * can actually state: a floor, a ceiling and a best guess. It degenerates to a
 * point estimate when the three are equal, so a point needs no special case.
 */
export function sampleTriangular(low: number, likely: number, high: number, u: number): number {
  const span = high - low;
  if (span <= 0) return low;
  const cut = (likely - low) / span;
  if (u < cut) return low + Math.sqrt(u * span * (likely - low));
  return high - Math.sqrt((1 - u) * span * (high - likely));
}

/** Nearest-rank percentile. Sorts a copy; `xs` is not mutated. */
export function percentile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const i = Math.round(q * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, i))];
}
