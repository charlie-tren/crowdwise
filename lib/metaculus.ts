import { categoriseMarket } from "./categorise";
import { parseProposition, type Proposition } from "./crossVenue";
import type { Category } from "./taxonomy";
import type { Market } from "./types";

// Metaculus is NOT a betting venue - it is a community-forecasting platform whose
// "community prediction" is a track-record-weighted aggregate of forecasters, not
// money at stake. It therefore lives in its own walled-off surface and is labelled
// as forecasts (not odds), so it never dilutes the site's real-money spine. The
// value it adds is CONTRAST: where reasoned forecasters disagree with where the
// money sits (Kalshi/Polymarket), the gap is the interesting signal.
//
// The API is token-gated (a free personal token, Authorization: Token <token>).
// The token is read server-side only from METACULUS_TOKEN and never reaches the
// browser. No token -> we degrade gracefully to an empty list (the tab shows
// "unavailable"), rather than crashing the build.

export const METACULUS_BASE = "https://www.metaculus.com/api";
export const DEFAULT_TIMEOUT = 10_000;

// Curated macro search terms. Metaculus has no macro tag as clean as Kalshi's
// series, so we search a handful of terms and dedupe. Kept deliberately small -
// these are the propositions that can actually match our market set.
export const METACULUS_MACRO_TERMS = [
  "recession",
  "federal reserve",
  "inflation",
  "unemployment",
  "GDP",
] as const;

export interface MetaculusForecast {
  id: number;
  title: string;
  category: Category;
  prob: number | null; // community prediction, 0..1; binary questions only
  forecasterCount: number; // number of forecasters (0 if unknown)
  closeDate: string; // ISO scheduled close, "" if unknown
  url: string;
}

type HttpGetJson = (
  url: string,
  params?: Record<string, string | number>,
  token?: string,
  timeoutMs?: number,
) => Promise<any>;

async function realHttpGetJson(
  url: string,
  params: Record<string, string | number> = {},
  token?: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const full = qs ? `${url}?${qs}` : url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(full, {
      headers: {
        Accept: "application/json",
        "User-Agent": "crowdwise/1.0",
        ...(token ? { Authorization: `Token ${token}` } : {}),
      },
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

// Pull the community-prediction probability out of a Metaculus question object.
// The current API exposes it at aggregations.recency_weighted.latest.centers[0]
// (an array); older shapes used community_prediction.full.q2 (the median). We try
// both defensively and clamp to [0,1] - anything else yields null.
function extractProb(question: any): number | null {
  const latest = question?.aggregations?.recency_weighted?.latest;
  const candidates: unknown[] = [
    latest?.centers?.[0],
    latest?.forecast_values?.[1], // [P(no), P(yes)] on some payloads
    question?.community_prediction?.full?.q2,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && c >= 0 && c <= 1) return c;
  }
  return null;
}

function extractForecasterCount(post: any, question: any): number {
  const latest = question?.aggregations?.recency_weighted?.latest;
  const candidates: unknown[] = [
    latest?.forecaster_count,
    question?.nr_forecasters,
    post?.nr_forecasters,
    post?.forecasts_count,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c >= 0) return Math.round(c);
  }
  return 0;
}

// Normalise a Metaculus post into a forecast, or null if it isn't a usable binary
// question with a community prediction. Group-of-questions posts and non-binary
// (numeric/date/multiple-choice) questions are skipped - only clean binary
// propositions can line up against our market set for the divergence view.
export function normaliseMetaculusPost(post: any): MetaculusForecast | null {
  if (!post || typeof post !== "object") return null;
  const question = post.question;
  if (!question || question.type !== "binary") return null;

  const prob = extractProb(question);
  if (prob == null) return null;

  const title: string = post.title ?? question.title ?? "";
  if (!title) return null;

  const id = Number(post.id ?? question.id);
  if (!Number.isFinite(id)) return null;

  const closeRaw = question.scheduled_close_time ?? post.scheduled_close_time ?? "";
  const closeDate = typeof closeRaw === "string" ? closeRaw : "";

  return {
    id,
    title,
    category: categoriseMarket(title),
    prob,
    forecasterCount: extractForecasterCount(post, question),
    closeDate,
    url: `https://www.metaculus.com/questions/${id}/`,
  };
}

// Fetch open macro binary questions from Metaculus, deduped by id and filtered to
// the macro categories with a usable community prediction. Token comes from the
// argument or METACULUS_TOKEN; without one we return [] (graceful degrade).
export async function fetchMetaculusForecasts(
  token = process.env.METACULUS_TOKEN,
  terms: readonly string[] = METACULUS_MACRO_TERMS,
): Promise<MetaculusForecast[]> {
  if (!token) {
    console.warn("Metaculus: no METACULUS_TOKEN set - skipping forecast pull");
    return [];
  }

  const results = await Promise.allSettled(
    terms.map((term) =>
      _httpGetJson(
        `${METACULUS_BASE}/posts/`,
        { search: term, statuses: "open", limit: 20, forecast_type: "binary" },
        token,
      ),
    ),
  );

  const seen = new Set<number>();
  const out: MetaculusForecast[] = [];
  results.forEach((res, i) => {
    if (res.status !== "fulfilled") {
      console.warn(`Metaculus term "${terms[i]}" fetch failed`, res.reason);
      return;
    }
    const posts = res.value?.results ?? res.value?.data ?? (Array.isArray(res.value) ? res.value : []);
    for (const post of posts) {
      const f = normaliseMetaculusPost(post);
      if (!f || f.prob == null) continue;
      if (f.category === "Other") continue; // not macro-relevant
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
  });
  return out;
}

// Reuse the validated cross-venue proposition parser by presenting a forecast as a
// Market-shaped object. parseProposition never inspects `platform`, so the dummy
// value is harmless; it keys on category + title (+ endDate for Fed).
function forecastAsMarket(f: MetaculusForecast): Market {
  return {
    id: `mc-${f.id}`,
    platform: "Kalshi",
    title: f.title,
    category: f.category,
    prob: f.prob,
    volume: f.forecasterCount,
    endDate: f.closeDate,
    status: "open",
    series: "",
    event: "",
  };
}

export interface MetaculusPair {
  type: string;
  key: string;
  label: string;
  market: Market; // highest-volume market on this proposition (the money)
  forecast: MetaculusForecast; // the forecasters
  marketProb: number;
  metaculusProb: number;
  divergence: number; // |marketProb - metaculusProb|, 0..1
}

// Pair each market against a Metaculus forecast that parses to the SAME
// proposition key (same outcome, never token overlap). Recession-by-year matches
// cleanly; Fed matches only when the Metaculus question carries an explicit bps
// bucket (community binaries usually don't - that is expected, not a bug).
// Returned sorted by divergence desc: the biggest forecaster-vs-money gaps first.
export function matchMetaculusToMarkets(
  markets: Market[],
  forecasts: MetaculusForecast[],
): MetaculusPair[] {
  const marketByKey = new Map<string, Market>();
  const propByKey = new Map<string, Proposition>();
  for (const m of markets) {
    const p = parseProposition(m);
    if (!p) continue;
    propByKey.set(p.key, p);
    const cur = marketByKey.get(p.key);
    if (!cur || m.volume > cur.volume) marketByKey.set(p.key, m);
  }

  const forecastByKey = new Map<string, MetaculusForecast>();
  for (const f of forecasts) {
    if (f.prob == null) continue;
    const p = parseProposition(forecastAsMarket(f));
    if (!p) continue;
    const cur = forecastByKey.get(p.key);
    if (!cur || f.forecasterCount > cur.forecasterCount) forecastByKey.set(p.key, f);
  }

  const pairs: MetaculusPair[] = [];
  for (const [key, market] of marketByKey) {
    const forecast = forecastByKey.get(key);
    if (!forecast || forecast.prob == null) continue;
    const prop = propByKey.get(key)!;
    const marketProb = market.prob as number;
    pairs.push({
      type: prop.type,
      key,
      label: prop.label,
      market,
      forecast,
      marketProb,
      metaculusProb: forecast.prob,
      divergence: Math.abs(marketProb - forecast.prob),
    });
  }

  pairs.sort((a, b) => b.divergence - a.divergence);
  return pairs;
}
