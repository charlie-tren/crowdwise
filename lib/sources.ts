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
export async function fetchPolymarketMarketHistory(
  tokenId: string,
  opts: { days?: number; fidelity?: number; nowTs?: number } = {},
): Promise<HistoryPoint[]> {
  if (!tokenId) return [];
  const { days = 90, fidelity = 60, nowTs } = opts;
  const end = Math.floor(nowTs ?? Date.now() / 1000);
  const start = end - days * 24 * 3600;
  let data: any;
  try {
    data = await _httpGetJson(
      `${POLYMARKET_CLOB_BASE}/prices-history`,
      { market: tokenId, startTs: start, endTs: end, fidelity },
      8000,
    );
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
