import { computeMoves } from "./history";
import type { Market, Snapshot, BoardPayload } from "./types";

export interface KvLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
}

const BOARD_KEY = "board:current";
const SNAP_KEY = "board:snapshots";

export function makeKvStore(kv: KvLike, opts: { maxSnapshots?: number } = {}) {
  const maxSnapshots = opts.maxSnapshots ?? 200;

  async function readSnapshots(): Promise<Snapshot[]> {
    return (await kv.get<Snapshot[]>(SNAP_KEY)) ?? [];
  }

  async function appendSnapshot(snap: Snapshot): Promise<void> {
    const snaps = await readSnapshots();
    snaps.push(snap);
    await kv.set(SNAP_KEY, snaps.slice(-maxSnapshots));
  }

  // Compute moves vs the latest snapshot, store the board, THEN append this
  // board as the new snapshot (matches the Streamlit order: delta first, save
  // after — see 7_Macro_Signals.py::_ensure_board).
  async function writeBoard(markets: Market[], fetchedAt: string): Promise<void> {
    const priorSnaps = await readSnapshots();
    const moves = computeMoves(markets, priorSnaps);
    const payload: BoardPayload = { markets, moves, fetchedAt };
    await kv.set(BOARD_KEY, payload);
    const probs: Record<string, number> = {};
    for (const m of markets) if (m.id && m.prob != null) probs[m.id] = m.prob;
    if (Object.keys(probs).length) await appendSnapshot({ ts: fetchedAt, probs });
  }

  async function readBoard(): Promise<BoardPayload | null> {
    return await kv.get<BoardPayload>(BOARD_KEY);
  }

  return { readSnapshots, appendSnapshot, writeBoard, readBoard };
}
