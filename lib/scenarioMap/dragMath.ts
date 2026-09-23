// The single source of truth for "pointer position becomes a new likely".
// MapView (the SVG picture) and NodeList (the always-visible list) both
// render a draggable track for an input node, and both call into this module
// rather than each doing their own arithmetic - two copies of this maths is
// exactly the shape of bug that lets the SVG and the list disagree about
// where the handle is.

/** A rect-like source of geometry. A real DOMRect satisfies this; so does a
 * plain object a test hands in, since jsdom gives every element a zeroed
 * getBoundingClientRect and there is no layout to fix that with. */
export interface TrackRect {
  left: number;
  width: number;
}

const clamp01 = (x: number): number => {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
};

/**
 * A pointer's clientX, turned into a 0..1 fraction of the track it landed on.
 * A track with no measured width (zero, as jsdom always reports) maps every
 * pointer position to 0 rather than dividing by zero into NaN.
 */
export function fractionFromClientX(clientX: number, rect: TrackRect): number {
  if (!(rect.width > 0)) return 0;
  return clamp01((clientX - rect.left) / rect.width);
}

export interface Range {
  low: number;
  likely: number;
  high: number;
}

/**
 * Shift the whole [low, high] band so `likely` moves to `targetLikely`,
 * preserving the band's width exactly. All three values move by the same
 * delta - this is what keeps low and high a fixed distance from likely,
 * rather than independently clamping likely inside a low/high wall it would
 * hit almost immediately.
 *
 * When the shifted band would spill past 0 or 1, the whole band slides back
 * just far enough to fit (never shrinks): it stops at the edge instead of
 * squashing.
 */
export function shiftRange(range: Range, targetLikely: number): Range {
  const delta = targetLikely - range.likely;
  let low = range.low + delta;
  let likely = range.likely + delta;
  let high = range.high + delta;

  if (low < 0) {
    const fix = -low;
    low += fix;
    likely += fix;
    high += fix;
  }
  if (high > 1) {
    const fix = high - 1;
    low -= fix;
    likely -= fix;
    high -= fix;
  }

  return { low: clamp01(low), likely: clamp01(likely), high: clamp01(high) };
}

/** One arrow-key step, as a fraction of the 0..1 range. */
export const KEY_STEP = 0.01;

/** Home/End and the arrow keys all reduce to "what should the new likely
 * target be", then go through shiftRange like a drag would. */
export function likelyForKey(key: string, current: number): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clamp01(current - KEY_STEP);
    case "ArrowRight":
    case "ArrowUp":
      return clamp01(current + KEY_STEP);
    case "Home":
      return 0;
    case "End":
      return 1;
    default:
      return null;
  }
}
