/** id -> ISO time the market was last on the board. Published as /market-ids.json. */
export type SeenIds = Record<string, string>;

export const KEEP_DAYS = 30;
// Keeps the export under the free plan's 20,000 static-asset files (~9 per market).
export const MAX_RETAINED = 1000;

/** Parse a previous build's /market-ids.json, dropping anything malformed. */
export function parseSeen(raw: unknown): SeenIds {
  const out: SeenIds = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
    if (id && typeof t === "string" && !Number.isNaN(Date.parse(t))) out[id] = t;
  }
  return out;
}

/** Off-board ids from the previous build still worth a page: seen within KEEP_DAYS, newest first. */
export function retainedIds(boardIds: string[], prev: SeenIds, nowMs: number): string[] {
  const onBoard = new Set(boardIds);
  const cutoff = nowMs - KEEP_DAYS * 86_400_000;
  return Object.entries(prev)
    .filter(([id, t]) => !onBoard.has(id) && Date.parse(t) >= cutoff)
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .slice(0, MAX_RETAINED)
    .map(([id]) => id);
}
