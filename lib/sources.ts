import { normaliseKalshiMarket, normalisePolymarketMarket } from "./normalise";
import { KALSHI_MACRO_SERIES } from "./taxonomy";
import { candleProb, clampProb } from "./parse";
import type { Category } from "./taxonomy";
import type { Market, HistoryPoint } from "./types";

export const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
export const POLYMARKET_BASE = "https://gamma-api.polymarket.com";
export const POLYMARKET_CLOB_BASE = "https://clob.polymarket.com";
export const DEFAULT_TIMEOUT = 10_000;

type HttpGetJson = (url: string, params?: Record<string, string | number>, timeoutMs?: number) => Promise<any>;

async function realHttpGetJson(url: string, params: Record<string, string | number> = {}, timeoutMs = DEFAULT_TIMEOUT): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const full = qs ? `${url}?${qs}` : url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(full, {
      headers: { Accept: "application/json", "User-Agent": "crowdwise/1.0" },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

let _httpGetJson: HttpGetJson = realHttpGetJson;
export function setHttpGetJson(fn: HttpGetJson) { _httpGetJson = fn; }
export function resetHttpGetJson() { _httpGetJson = realHttpGetJson; }

export async function fetchKalshiSeriesMarkets(
  seriesTicker: string, category?: Category, status = "open", limit = 200,
): Promise<Market[]> {
  const data = await _httpGetJson(`${KALSHI_BASE}/markets`, { series_ticker: seriesTicker, status, limit });
  const raw = data?.markets ?? [];
  return raw.map((m: Record<string, any>) => normaliseKalshiMarket(m, category));
}

export async function fetchKalshiMarkets(
  series: Record<string, Category> = KALSHI_MACRO_SERIES, status = "open",
): Promise<Market[]> {
  const entries = Object.entries(series);
  const results = await Promise.allSettled(
    entries.map(([seriesTicker, theme]) => fetchKalshiSeriesMarkets(seriesTicker, theme, status)),
  );
  const out: Market[] = [];
  results.forEach((res, i) => {
    if (res.status === "fulfilled") {
      out.push(...res.value);
    } else {
      console.warn(`Kalshi series ${entries[i][0]} fetch failed`, res.reason);
    }
  });
  return out;
}

// Curated Polymarket Gamma tag IDs for macro markets that sit BELOW the
// top-by-volume cut (Fed decision buckets, recession) and so never surface in a
// pure volume-sorted pull. Discovered via the /tags endpoint: "Economy" (100328)
// carries the full US Fed decision set (no-change / ±25 / ±50 per meeting) plus
// rate-cut-count markets; "recession" (100201) carries recession markets. Pulling
// these is what gives the cross-venue matcher real overlap with Kalshi's macro
// set instead of only the 2-3 highest-volume Fed markets.
export const POLYMARKET_MACRO_TAGS = ["100328", "100201"];

function polymarketItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return data.data ?? data.markets ?? [];
  return [];
}

export async function fetchPolymarketMarkets(limit = 500): Promise<Market[]> {
  const base = { active: "true", closed: "false", order: "volumeNum", ascending: "false" };
  const calls: Array<Promise<any>> = [
    _httpGetJson(`${POLYMARKET_BASE}/markets`, { ...base, limit }),
    ...POLYMARKET_MACRO_TAGS.map((tag_id) =>
      _httpGetJson(`${POLYMARKET_BASE}/markets`, { ...base, tag_id, limit: 100 }),
    ),
  ];
  const results = await Promise.allSettled(calls);
  const seen = new Set<string>();
  const out: Market[] = [];
  results.forEach((res, i) => {
    if (res.status !== "fulfilled") {
      console.warn(`Polymarket pull (${i === 0 ? "volume" : `tag ${POLYMARKET_MACRO_TAGS[i - 1]}`}) failed`, res.reason);
      return;
    }
    for (const raw of polymarketItems(res.value)) {
      const m = normalisePolymarketMarket(raw);
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  });
  return out;
}

export async function fetchKalshiMarketHistory(
  seriesTicker: string, marketTicker: string,
  opts: { days?: number; periodInterval?: number; nowTs?: number } = {},
): Promise<HistoryPoint[]> {
  if (!seriesTicker || !marketTicker) return [];
  const { days = 90, periodInterval = 1440, nowTs } = opts;
  const end = Math.floor(nowTs ?? Date.now() / 1000);
  const start = end - days * 24 * 3600;
  const url = `${KALSHI_BASE}/series/${seriesTicker}/markets/${marketTicker}/candlesticks`;
  let data: any;
  try {
    data = await _httpGetJson(url, { start_ts: start, end_ts: end, period_interval: periodInterval }, 8000);
  } catch {
    return [];
  }
  if (!data) return [];
  const out: HistoryPoint[] = [];
  for (const candle of data.candlesticks ?? []) {
    const ts = candle.end_period_ts;
    const prob = candleProb(candle);
    if (ts === null || ts === undefined || prob === null) continue;
    const iso = new Date(Number(ts) * 1000).toISOString();
    out.push([iso, prob]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

// Polymarket price history from the CLOB /prices-history endpoint. `tokenId` is
// the YES-outcome CLOB token id (Market.clobTokenId from Gamma clobTokenIds[0]) -
// the conditionId does NOT work here. Returns [iso, prob] pairs oldest-first.
// Best-effort: empty on missing id, error, or empty history (mirrors the Kalshi
// candlestick fetcher). fidelity is the bar width in minutes.
//
// Two query modes: pass `interval` ("max" | "1m" | "1w" | "1d" | "6h" | "1h") to
// get all available history for that lookback - use this for markets whose age is
// unknown, because a startTs BEFORE the market's first trade makes the CLOB return
// an EMPTY set rather than clamping. Omit `interval` to use an explicit `days`
// window - fine only when there's known history that far back (e.g. 7d sparklines).
export async function fetchPolymarketMarketHistory(
  tokenId: string,
  opts: { days?: number; fidelity?: number; nowTs?: number; interval?: string } = {},
): Promise<HistoryPoint[]> {
  if (!tokenId) return [];
  const { days = 90, fidelity = 60, nowTs, interval } = opts;
  const end = Math.floor(nowTs ?? Date.now() / 1000);
  const params: Record<string, string | number> = interval
    ? { market: tokenId, interval, fidelity }
    : { market: tokenId, startTs: end - days * 24 * 3600, endTs: end, fidelity };
  let data: any;
  try {
    data = await _httpGetJson(`${POLYMARKET_CLOB_BASE}/prices-history`, params, 8000);
  } catch {
    return [];
  }
  const out: HistoryPoint[] = [];
  for (const point of data?.history ?? []) {
    const ts = Number(point?.t);
    const rawP = Number(point?.p);
    if (!Number.isFinite(ts) || !Number.isFinite(rawP)) continue;
    const prob = clampProb(rawP) as number; // finite -> never null
    const iso = new Date(ts * 1000).toISOString();
    out.push([iso, prob]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

// Fetch ONE market directly by its id, independent of the volume-ranked top-set.
// The board's top-set shifts slightly between requests (venue volume ordering +
// transient per-series failures), so finding a market by filtering a fresh
// fetchTopMarkets() call can 404 a link that was valid when it was generated.
// A by-id lookup is deterministic. Kalshi ids are tickers (KXFED-26JUL-H0);
// Polymarket ids are 0x-prefixed condition ids. Returns null when not found or
// on any error, so callers can still fall back to the top-set.
export async function fetchMarketById(id: string): Promise<Market | null> {
  const key = id.trim();
  if (!key) return null;
  const isPolymarket = key.startsWith("0x");
  try {
    if (isPolymarket) {
      const data = await _httpGetJson(`${POLYMARKET_BASE}/markets`, { condition_ids: key, limit: 1 });
      const raw = polymarketItems(data)[0];
      if (!raw) return null;
      const m = normalisePolymarketMarket(raw);
      return m.id ? m : null;
    }
    const data = await _httpGetJson(`${KALSHI_BASE}/markets/${encodeURIComponent(key)}`);
    const raw = data?.market ?? data;
    if (!raw?.ticker) return null;
    return normaliseKalshiMarket(raw as Record<string, any>);
  } catch {
    return null;
  }
}
