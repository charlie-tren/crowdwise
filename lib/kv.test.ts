import { describe, it, expect, beforeEach } from "vitest";
import { makeKvStore } from "./kv";
import type { Market } from "./types";

function fakeKv() {
  const m = new Map<string, unknown>();
  return {
    store: m,
    async get<T>(k: string) { return (m.get(k) as T) ?? null; },
    async set(k: string, v: unknown) { m.set(k, v); },
  };
}

const mkt = (id: string, prob: number): Market => ({
  id, platform: "Kalshi", title: id, category: "Rates/Fed", prob, volume: 1,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

describe("kv store", () => {
  let kv: ReturnType<typeof fakeKv>;
  let store: ReturnType<typeof makeKvStore>;
  beforeEach(() => { kv = fakeKv(); store = makeKvStore(kv, { maxSnapshots: 3 }); });

  it("writeBoard then readBoard roundtrips with moves vs prior snapshot", async () => {
    await store.appendSnapshot({ ts: "t0", probs: { a: 0.40 } });
    await store.writeBoard([mkt("a", 0.55)], "2026-07-15T10:00:00");
    const payload = await store.readBoard();
    expect(payload?.markets.length).toBe(1);
    expect(payload?.moves.a).toBeCloseTo(0.15);
    expect(payload?.fetchedAt).toBe("2026-07-15T10:00:00");
  });

  it("readBoard returns null when nothing cached", async () => {
    expect(await store.readBoard()).toBeNull();
  });

  it("appendSnapshot trims to maxSnapshots", async () => {
    for (let i = 0; i < 6; i++) await store.appendSnapshot({ ts: `t${i}`, probs: { a: i / 10 } });
    const snaps = await store.readSnapshots();
    expect(snaps.length).toBe(3);
    expect(snaps.map((s) => s.ts)).toEqual(["t3", "t4", "t5"]);
  });
});
