import type { Direction, StrikeLadder } from "./relativeValue";

// A strike ladder prices the CUMULATIVE probability at each threshold. The
// implied *distribution* is the mass sitting between adjacent thresholds - the
// discrete histogram the market is implying for where the metric lands.
//
// For an "above" ladder rung.prob = P(metric > threshold), decreasing in the
// threshold. The mass in the interval [t_i, t_{i+1}) is P(>t_i) - P(>t_{i+1}).
// We also emit the two OPEN tails so the buckets form a genuine distribution
// that sums to ~1 on a clean ladder:
//   - open bottom bucket (below the lowest strike): 1 - P(>t_0)
//   - open top bucket (above the highest strike):   P(>t_last)
// "below" ladders (rung.prob = P(metric < threshold), increasing) are handled
// analogously - the interval and tail formulae just flip.
//
// Buckets are returned left-to-right in ascending metric order (open bottom
// first, open top last). A `lo`/`hi` of null denotes an open (unbounded) end.
// Adjacent-threshold noise (bid-ask, staleness, a sub-eps inversion the ladder
// did not flag) can push a raw mass slightly negative; those are clamped to 0.

export interface DistributionBucket {
  lo: number | null; // lower edge of the bucket; null = open below (-infinity)
  hi: number | null; // upper edge of the bucket; null = open above (+infinity)
  mass: number; // implied probability mass in the bucket, clamped to >= 0
}

export interface Distribution {
  buckets: DistributionBucket[];
  metric: string;
  period: string;
  direction: Direction;
}

const clampMass = (x: number): number => (x > 0 ? x : 0);

// Core builder: takes cumulative probs keyed by threshold and produces the
// bucketed distribution. Exposed so callers can rebuild a PAST distribution
// from historical probs (the 7-day ghost) without a full StrikeLadder.
export function probsToDistribution(
  points: Array<{ threshold: number; prob: number }>,
  direction: Direction,
  metric: string,
  period: string,
): Distribution {
  const sorted = [...points].sort((a, b) => a.threshold - b.threshold);
  const buckets: DistributionBucket[] = [];
  const n = sorted.length;
  if (n === 0) return { buckets, metric, period, direction };

  const first = sorted[0];
  const last = sorted[n - 1];

  if (direction === "above") {
    // below the lowest strike: 1 - P(> t_0)
    buckets.push({ lo: null, hi: first.threshold, mass: clampMass(1 - first.prob) });
    for (let i = 0; i < n - 1; i++) {
      buckets.push({
        lo: sorted[i].threshold,
        hi: sorted[i + 1].threshold,
        mass: clampMass(sorted[i].prob - sorted[i + 1].prob),
      });
    }
    // above the highest strike: P(> t_last)
    buckets.push({ lo: last.threshold, hi: null, mass: clampMass(last.prob) });
  } else {
    // below the lowest strike: P(< t_0)
    buckets.push({ lo: null, hi: first.threshold, mass: clampMass(first.prob) });
    for (let i = 0; i < n - 1; i++) {
      buckets.push({
        lo: sorted[i].threshold,
        hi: sorted[i + 1].threshold,
        mass: clampMass(sorted[i + 1].prob - sorted[i].prob),
      });
    }
    // above the highest strike: 1 - P(< t_last)
    buckets.push({ lo: last.threshold, hi: null, mass: clampMass(1 - last.prob) });
  }

  return { buckets, metric, period, direction };
}

export function ladderToDistribution(ladder: StrikeLadder): Distribution {
  return probsToDistribution(
    ladder.rungs.map((r) => ({ threshold: r.threshold, prob: r.prob })),
    ladder.direction,
    ladder.metric,
    ladder.period,
  );
}
