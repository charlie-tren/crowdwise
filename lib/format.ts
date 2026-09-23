export function fmtVol(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return `${Math.round(v)}`;
}

export function daysTo(endDate: string): number | null {
  const d = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t0) / 86_400_000);
}

export function pct(p: number | null, decimals = 1): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(decimals)}%`;
}

/**
 * Whole-percent, like pct(p, 0), except it never rounds a genuinely non-zero
 * probability down to "0%" nor a genuinely sub-certain one up to "100%":
 * either string is a claim (impossible, certain) the engine did not make.
 * A genuine 0 or 1 still renders "0%" / "100%", because those ARE honest.
 *
 * Scoped to the Scenario Map only (MapView, MapOutline, NodeList). pct()
 * itself is untouched: every other caller on the site - the board, the
 * cross-venue page, the treemap, the headline odds strip - keeps today's
 * plain whole-percent rounding.
 */
export function pctScenario(p: number | null): string {
  if (p == null) return pct(p);
  const whole = Math.round(p * 100);
  if ((p !== 0 && whole === 0) || (p !== 1 && whole === 100)) {
    return `${(p * 100).toFixed(1)}%`;
  }
  return `${whole}%`;
}

// Single-hue (blue) sequential ramp. Probability = magnitude, NOT sentiment.
// No green/yellow/red. The number itself stays neutral (--text); this drives
// meter bars + chart fills only.
const PROB_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [0x33, 0x41, 0x5a]],
  [0.25, [0x3f, 0x65, 0x97]],
  [0.5, [0x4c, 0x8b, 0xd0]],
  [0.75, [0x5a, 0xa9, 0xee]],
  [1.0, [0x7c, 0xc4, 0xff]],
];

export function probFill(p: number | null): string {
  if (p == null) return "#3a4256";
  const x = Math.max(0, Math.min(1, p));
  for (let i = 1; i < PROB_STOPS.length; i++) {
    const [p1, c1] = PROB_STOPS[i];
    const [p0, c0] = PROB_STOPS[i - 1];
    if (x <= p1) {
      const t = (x - p0) / (p1 - p0);
      const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
      return `rgb(${mix(c0[0], c1[0])}, ${mix(c0[1], c1[1])}, ${mix(c0[2], c1[2])})`;
    }
  }
  return "#7cc4ff";
}
