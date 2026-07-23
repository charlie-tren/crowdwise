import { categoriseMarket } from "./categorise";
import { toFloat, isoDate, kalshiProb, firstOutcomePrice, firstClobTokenId, stripMarkdown } from "./parse";
import type { Category } from "./taxonomy";
import type { Market } from "./types";

export function normaliseKalshiMarket(raw: Record<string, any>, category?: Category): Market {
  const ticker = String(raw.ticker ?? "").trim();
  const series = ticker.includes("-") ? ticker.split("-", 1)[0] : ticker;
  const title = stripMarkdown(String(raw.title ?? raw.yes_sub_title ?? ticker).trim());
  return {
    id: ticker,
    platform: "Kalshi",
    title,
    category: category !== undefined ? category : categoriseMarket(title, series),
    prob: kalshiProb(raw),
    volume: toFloat(raw.volume_fp, 0),
    endDate: isoDate(raw.close_time ?? raw.expiration_time),
    status: String(raw.status ?? "").trim().toLowerCase(),
    series,
    event: String(raw.event_ticker ?? "").trim(),
  };
}

export function normalisePolymarketMarket(raw: Record<string, any>): Market {
  const mid = String(raw.conditionId ?? raw.id ?? raw.slug ?? "").trim();
  const title = stripMarkdown(String(raw.question ?? raw.title ?? mid).trim());
  const volume = raw.volumeNum ?? raw.volume;
  const status = raw.closed ? "closed" : raw.active ? "active" : "";
  return {
    id: mid,
    platform: "Polymarket",
    title,
    category: categoriseMarket(title, ""),
    prob: firstOutcomePrice(raw.outcomePrices),
    volume: toFloat(volume, 0),
    endDate: isoDate(raw.endDate ?? raw.end_date),
    status,
    series: "",
    event: "",
    clobTokenId: firstClobTokenId(raw.clobTokenIds),
  };
}
