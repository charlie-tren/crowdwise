import { describe, it, expect } from "vitest";
import { builtInMaps } from "./builtins";
import { evaluateMap } from "./engine";
import { THESES } from "@/lib/thesis";
import type { Market } from "@/lib/types";

const mk = (id: string, title: string, category: Market["category"], prob: number): Market => ({
  id, platform: "Kalshi", title, category, prob, volume: 1000,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

// Titles chosen to satisfy the leg predicates in lib/thesis.ts.
const board: Market[] = [
  mk("rec", "Will the US enter a recession in 2026?", "Growth/Recession", 0.3),
  mk("cut", "Fed cut rates before 2027", "Rates/Fed", 0.8),
  mk("nocut", "No Fed rate cuts in 2026", "Rates/Fed", 0.15),
  mk("unemp", "Will unemployment reach 5% in 2026?", "Growth/Recession", 0.25),
];

describe("builtInMaps", () => {
  it("returns one map per thesis, each marked built in", () => {
    const maps = builtInMaps(board);
    expect(maps).toHaveLength(THESES.length);
    expect(maps.every((m) => m.builtIn)).toBe(true);
  });

  it("gives every map a combined node reading AND over its legs", () => {
    for (const m of builtInMaps(board)) {
      const combined = m.nodes.filter((n) => n.kind === "formula");
      expect(combined).toHaveLength(1);
      expect(combined[0]).toMatchObject({ op: "and" });
      expect(combined[0].id).toBe(`${m.id}-combined`);
    }
  });

  it("reproduces the thesis joint probability", () => {
    // "Recession in 2026" is recession YES (0.3) and Fed cuts YES (0.8) = 0.24.
    const m = builtInMaps(board).find((x) => x.id === "recession")!;
    const r = evaluateMap(m, board);
    expect(r.get("recession-combined")!.p50).toBeCloseTo(0.24, 6);
  });

  it("takes the NO side where the thesis leg says no", () => {
    // "Soft landing" is recession NO (0.7) and Fed cuts YES (0.8) = 0.56.
    const m = builtInMaps(board).find((x) => x.id === "soft-landing")!;
    const r = evaluateMap(m, board);
    expect(r.get("soft-landing-combined")!.p50).toBeCloseTo(0.56, 6);
  });

  it("hardcodes no market ids: a different board gives different prices", () => {
    const moved = board.map((m) => (m.id === "rec" ? { ...m, id: "rec2" } : m));
    const m = builtInMaps(moved).find((x) => x.id === "recession")!;
    expect(m.nodes.some((n) => n.kind === "market" && n.marketId === "rec2")).toBe(true);
  });

  it("leaves a leg with no market unresolved and still resolves its sibling", () => {
    const thin = board.filter((m) => m.id !== "rec");
    const m = builtInMaps(thin).find((x) => x.id === "recession")!;
    const r = evaluateMap(m, thin);
    const legs = m.nodes.filter((n) => n.kind === "market");
    const statuses = legs.map((n) => r.get(n.id)!.status);
    expect(statuses).toContain("unresolved");
    expect(statuses).toContain("ok");
    expect(r.get("recession-combined")!.status).toBe("unresolved");
  });
});
