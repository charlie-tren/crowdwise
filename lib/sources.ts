import { normaliseKalshiMarket, normalisePolymarketMarket } from "./normalise";
import { KALSHI_MACRO_SERIES } from "./taxonomy";
import { candleProb } from "./parse";
import type { Category } from "./taxonomy";
import type { Market, HistoryPoint } from "./types";

export const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
export const POLYMARKET_BASE = "https://gamma-api.polymarket.com";
export const DEFAULT_TIMEOUT = 10_000;

type HttpGetJson = (url: string, params?: Record<string, string | number>, timeoutMs?: number) => Promise<any>;

async function realHttpGetJson(url: string, params: Record<string, string | number> = {}, timeoutMs = DEFAULT_TIMEOUT): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const full = qs ? `${url}?${qs}` : url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(full, {
      headers: { Accept: "application/json", "User-Agent": "macro-signals-web/1.0" },
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

export async function fetchPolymarketMarkets(limit = 500): Promise<Market[]> {
  const data = await _httpGetJson(`${POLYMARKET_BASE}/markets`, {
    limit, active: "true", closed: "false", order: "volumeNum", ascending: "false",
  });
  let items: any[];
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === "object") items = data.data ?? data.markets ?? [];
  else items = [];
  return items.map((m) => normalisePolymarketMarket(m));
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
