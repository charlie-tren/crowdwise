import { promises as fs } from "node:fs";
import path from "node:path";
import { fetchTopMarkets } from "./board";
import { fetchMarketById } from "./sources";
import { mapLimit } from "./throttle";
import { parseSeen, retainedIds, type SeenIds } from "./builtIds";
import { SITE_URL } from "./site";
import { FALLBACK_ID } from "./marketFallback";
import type { Market } from "./types";

export interface BuildBoard {
  markets: Market[];
  /** Off-board markets kept from earlier builds, so their pages outlive the board. */
  extra: Market[];
  seen: SeenIds;
  builtAt: string;
}

// One fetch per build, shared by every page and build worker through this file.
// `npm run build` clears it first (prebuild).
const SNAPSHOT = path.join(process.cwd(), ".build-snapshot", "board.json");

async function previousSeen(): Promise<SeenIds> {
  try {
    const r = await fetch(`${SITE_URL}/market-ids.json`, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? parseSeen(await r.json()) : {};
  } catch {
    return {};
  }
}

async function compute(): Promise<BuildBoard> {
  const markets = await fetchTopMarkets();
  if (!markets.length) throw new Error("Board came back empty; refusing to publish an empty site.");
  const now = new Date();
  const builtAt = now.toISOString();
  const seen: SeenIds = Object.fromEntries(markets.map((m) => [m.id, builtAt]));
  const prev = await previousSeen();
  const found = await mapLimit(retainedIds(Object.keys(seen), prev, now.getTime()), 4, 100, fetchMarketById);
  const extra = found.filter((m): m is Market => m !== null);
  for (const m of extra) seen[m.id] = prev[m.id];
  return { markets, extra, seen, builtAt };
}

let memo: Promise<BuildBoard> | null = null;

async function load(): Promise<BuildBoard> {
  if (process.env.NODE_ENV !== "production") return compute();
  try {
    return JSON.parse(await fs.readFile(SNAPSHOT, "utf8")) as BuildBoard;
  } catch {
    /* first caller in this build */
  }
  const board = await compute();
  await fs.mkdir(path.dirname(SNAPSHOT), { recursive: true });
  const tmp = `${SNAPSHOT}.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(board));
  await fs.rename(tmp, SNAPSHOT);
  return board;
}

export function getBuildBoard(): Promise<BuildBoard> {
  return (memo ??= load());
}

// Every market on the board, plus off-board markets from recent builds. Any other
// id is served by the Worker as the FALLBACK_ID shell, rendered in the browser.
export async function marketParams(): Promise<Array<{ id: string }>> {
  const { markets, extra } = await getBuildBoard();
  return [...markets, ...extra].map((m) => ({ id: m.id })).concat({ id: FALLBACK_ID });
}

export async function findBuiltMarket(id: string): Promise<Market | null> {
  const b = await getBuildBoard();
  return b.markets.find((m) => m.id === id) ?? b.extra.find((m) => m.id === id) ?? null;
}
