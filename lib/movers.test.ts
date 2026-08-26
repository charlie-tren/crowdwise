import { describe, it, expect } from "vitest";
import { computeTopMovers, hasHistorySource } from "./movers";
import type { Market, HistoryPoint } from "./types";

const m = (
  id: string, vol: number, plat: "Kalshi" | "Polymarket" = "Kalshi",
  series = "KX", clobTokenId?: string,
): Market => ({
  id, platform: plat, title: `t-${id}`, category: "Rates/Fed", prob: 0.5, volume: vol,
  endDate: "2026-12-31", status: "active", series, event: "", clobTokenId,
});

const pts = (first: number, last: number): HistoryPoint[] => [["2026-06-01", first], ["2026-06-08", last]];

describe("computeTopMovers", () => {
  it("ranks by absolute move, caps topN, skips tiny moves", async () => {
    const markets = [m("a", 100), m("b", 90), m("c", 80), m("d", 70)];
    const hist: Record<string, HistoryPoint[]> = {
      a: pts(0.5, 0.55),  // +0.05
      b: pts(0.5, 0.20),  // -0.30 (biggest)
      c: pts(0.5, 0.502), // +0.002 -> below minMove, dropped
      d: pts(0.5, 0.60),  // +0.10
    };
    const out = await computeTopMovers(markets, async (mk) => hist[mk.id] ?? [], { topN: 2, retries: 0 });
    expect(out.map((x) => x.id)).toEqual(["b", "d"]); // |0.30| > |0.10|
    expect(out[0].move).toBeCloseTo(-0.30);
  });

  it("scores Polymarket markets too, not just Kalshi", async () => {
    const markets = [m("k", 100), m("p", 999, "Polymarket", "", "tok-p")];
    const seen: string[] = [];
    const out = await computeTopMovers(markets, async (mk) => { seen.push(mk.id); return pts(0.4, 0.6); });
    expect(seen.sort()).toEqual(["k", "p"]);
    expect(out.map((x) => x.id)).toEqual(["p", "k"]); // ordered by volume-driven equal move -> stable by input order
  });

  it("skips markets with no route to price history", async () => {
    const markets = [
      m("k", 100),
      m("no-token", 999, "Polymarket", ""),  // Polymarket without a CLOB token id
      m("no-series", 500, "Kalshi", ""),     // Kalshi without a series ticker
    ];
    const seen: string[] = [];
    await computeTopMovers(markets, async (mk) => { seen.push(mk.id); return pts(0.4, 0.6); });
    expect(seen).toEqual(["k"]);
  });

  it("retries a market that comes back empty, then keeps it", async () => {
    let calls = 0;
    const out = await computeTopMovers([m("flaky", 100)], async () => {
      calls += 1;
      return calls === 1 ? [] : pts(0.3, 0.5); // first call throttled -> []
    });
    expect(calls).toBe(2);
    expect(out.map((x) => x.id)).toEqual(["flaky"]);
  });

  it("dedupes on the caller's key BEFORE the topN cut, so the panel stays full", async () => {
    // a and b collapse to one label; c and d are distinct. topN 2 must return
    // the survivor of a/b plus c, NOT a/b's survivor plus a hole.
    const markets = [m("a", 100), m("b", 99), m("c", 98), m("d", 97)];
    const hist: Record<string, HistoryPoint[]> = {
      a: pts(0.5, 0.90), // +0.40 biggest
      b: pts(0.5, 0.80), // +0.30, same label as a -> dropped
      c: pts(0.5, 0.70), // +0.20
      d: pts(0.5, 0.60), // +0.10
    };
    const label: Record<string, string> = { a: "Fed holds", b: "Fed holds", c: "Fed hikes", d: "Fed cuts" };
    const out = await computeTopMovers(markets, async (mk) => hist[mk.id] ?? [], {
      topN: 2, retries: 0, dedupeKey: (mk) => label[mk.id],
    });
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("keeps every row when no dedupe key is given", async () => {
    const markets = [m("a", 100), m("b", 99)];
    const out = await computeTopMovers(markets, async () => pts(0.5, 0.9), { retries: 0 });
    expect(out).toHaveLength(2);
  });

  it("a failing fetch is skipped, not fatal", async () => {
    const markets = [m("ok", 100), m("bad", 90)];
    const out = await computeTopMovers(markets, async (mk) => {
      if (mk.id === "bad") throw new Error("boom");
      return pts(0.3, 0.5);
    }, { retries: 0 });
    expect(out.map((x) => x.id)).toEqual(["ok"]);
  });

  it("respects the concurrency ceiling", async () => {
    const markets = Array.from({ length: 12 }, (_, i) => m(`m${i}`, 100 - i));
    let inFlight = 0, peak = 0;
    await computeTopMovers(markets, async () => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return pts(0.3, 0.5);
    }, { concurrency: 3, retries: 0 });
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("hasHistorySource", () => {
  it("requires a series for Kalshi and a CLOB token for Polymarket", () => {
    expect(hasHistorySource(m("a", 1))).toBe(true);
    expect(hasHistorySource(m("a", 1, "Kalshi", ""))).toBe(false);
    expect(hasHistorySource(m("a", 1, "Polymarket", "", "tok"))).toBe(true);
    expect(hasHistorySource(m("a", 1, "Polymarket", ""))).toBe(false);
  });
});
