import { describe, it, expect } from "vitest";
import { buildSparklines } from "./sparklines";
import type { Market, HistoryPoint } from "./types";

let seq = 0;
const m = (overrides: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `KX-${seq}`, platform: "Kalshi", title: "x", category: "Rates/Fed",
    prob: 0.5, volume: 1000, endDate: "2026-09-16", status: "active", series: "KXFED", event: "",
    ...overrides,
  };
};
const pts = (vals: number[]): HistoryPoint[] => vals.map((v, i) => [`t${i}`, v]);

describe("buildSparklines", () => {
  it("returns a compact series and net move per Kalshi market", async () => {
    const a = m({ id: "KX-A", volume: 900 });
    const b = m({ id: "KX-B", volume: 800 });
    const hist: Record<string, number[]> = { "KX-A": [0.2, 0.3, 0.5], "KX-B": [0.6, 0.55, 0.4] };
    const out = await buildSparklines([a, b], async (mkt) => pts(hist[mkt.id] ?? []));
    expect(out.sparks["KX-A"]).toEqual([0.2, 0.3, 0.5]);
    expect(out.moves["KX-A"]).toBeCloseTo(0.3, 5); // 0.5 - 0.2
    expect(out.moves["KX-B"]).toBeCloseTo(-0.2, 5);
  });

  it("covers a Polymarket market that carries a clobTokenId", async () => {
    const p = m({ id: "0xposy", platform: "Polymarket", series: "", clobTokenId: "tok123", volume: 5000 });
    const out = await buildSparklines([p], async (mkt) =>
      pts(mkt.clobTokenId === "tok123" ? [0.4, 0.45, 0.6] : []),
    );
    expect(out.sparks["0xposy"]).toEqual([0.4, 0.45, 0.6]);
    expect(out.moves["0xposy"]).toBeCloseTo(0.2, 5);
  });

  it("excludes a Polymarket market with no clobTokenId (no history source)", async () => {
    const p = m({ id: "0xnotok", platform: "Polymarket", series: "", volume: 5000 });
    let called = false;
    const out = await buildSparklines([p], async () => { called = true; return pts([0.1, 0.2, 0.3]); });
    expect(out.sparks["0xnotok"]).toBeUndefined();
    expect(called).toBe(false); // never even fetched
  });

  it("skips a series with too few points", async () => {
    const k = m({ id: "KX-A", volume: 900 });
    const out = await buildSparklines([k], async () => pts([0.3])); // 1 point < minPoints
    expect(out.sparks["KX-A"]).toBeUndefined();
  });

  it("bounds the fetch to maxMarkets by volume", async () => {
    const markets = Array.from({ length: 5 }, (_, i) => m({ id: `KX-${i}`, volume: (i + 1) * 100 }));
    const fetched: string[] = [];
    await buildSparklines(markets, async (mkt) => { fetched.push(mkt.id); return pts([0.1, 0.2, 0.3]); }, { maxMarkets: 2 });
    expect(fetched.length).toBe(2); // the two highest-volume only
  });

  it("splits the budget across platforms so high-volume Polymarket doesn't starve Kalshi", async () => {
    const polys = [1, 2, 3].map((i) => m({ id: `0xp${i}`, platform: "Polymarket", series: "", clobTokenId: `t${i}`, volume: 1_000_000 + i }));
    const kals = [1, 2, 3].map((i) => m({ id: `KX-${i}`, platform: "Kalshi", volume: 100 + i }));
    const fetched: string[] = [];
    await buildSparklines([...polys, ...kals], async (mkt) => { fetched.push(mkt.id); return pts([0.1, 0.2, 0.3]); }, { maxMarkets: 4 });
    expect(fetched.length).toBe(4);
    expect(fetched.filter((id) => id.startsWith("0x")).length).toBe(2); // 2 Polymarket
    expect(fetched.filter((id) => id.startsWith("KX")).length).toBe(2); // 2 Kalshi - NOT starved despite far lower volume
  });

  it("downsamples a long series to the requested point count", async () => {
    const long = Array.from({ length: 100 }, (_, i) => i / 100);
    const out = await buildSparklines([m({ id: "KX-A" })], async () => pts(long), { points: 10 });
    expect(out.sparks["KX-A"]).toHaveLength(10);
    expect(out.sparks["KX-A"][0]).toBeCloseTo(0, 5);
  });
});
