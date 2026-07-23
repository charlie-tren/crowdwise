import type { Category } from "./taxonomy";

export interface Market {
  id: string;
  platform: "Kalshi" | "Polymarket";
  title: string;
  category: Category;
  prob: number | null;
  volume: number;
  endDate: string;
  status: string;
  series: string;
  event: string;
  // Polymarket CLOB token id for the YES outcome (Gamma clobTokenIds[0]). Needed
  // to fetch price history from the CLOB /prices-history endpoint - the conditionId
  // in `id` does NOT work there. Absent for Kalshi.
  clobTokenId?: string;
}

export type HistoryPoint = [string, number]; // [isoTs, prob]

export interface Snapshot { ts: string; probs: Record<string, number>; }

export interface BoardPayload {
  markets: Market[];
  moves: Record<string, number>;
  fetchedAt: string;
}
