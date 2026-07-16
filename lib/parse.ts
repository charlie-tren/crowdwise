export function toFloat(value: unknown, def = 0): number {
  if (value === null || value === undefined || value === "") return def;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : def;
}

export function isoDate(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

// Strip the markdown bold markers Kalshi embeds in market titles (e.g.
// "Will **real GDP** increase..."), which would otherwise render raw as text.
export function stripMarkdown(s: string): string {
  return s.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1");
}

export function clampProb(p: number | null): number | null {
  if (p === null || p === undefined) return null;
  return Math.min(Math.max(p, 0), 1);
}

export function firstOutcomePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let val: unknown = raw;
  try {
    if (typeof val === "string") val = JSON.parse(val);
    if (Array.isArray(val) && val.length > 0) {
      const n = Number(val[0]);
      return Number.isFinite(n) ? clampProb(n) : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function kalshiProb(raw: Record<string, unknown>): number | null {
  const last = toFloat(raw.last_price_dollars, 0);
  if (last > 0) return clampProb(last);
  const bid = toFloat(raw.yes_bid_dollars, 0);
  const ask = toFloat(raw.yes_ask_dollars, 0);
  if (ask > 0) return clampProb((bid + ask) / 2);
  return null;
}

export function candleProb(candle: Record<string, any>): number | null {
  const price = candle.price ?? {};
  for (const key of ["close_dollars", "mean_dollars", "previous_dollars"]) {
    const raw = price[key];
    if (raw !== null && raw !== undefined) {
      const v = toFloat(raw, 0);
      if (v > 0) return clampProb(v);
    }
  }
  const bid = toFloat(candle.yes_bid?.close_dollars, 0);
  const ask = toFloat(candle.yes_ask?.close_dollars, 0);
  if (bid > 0 && ask > 0) return clampProb((bid + ask) / 2);
  return null;
}
