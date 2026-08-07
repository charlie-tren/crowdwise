import { describe, it, expect } from "vitest";
import { sortMarkets } from "./BoardTable";
import type { Market } from "@/lib/types";

let seq = 0;
const m = (o: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`, platform: "Kalshi", title: "x", category: "Rates/Fed",
    prob: 0.5, volume: 1000, endDate: "2026-09-16", status: "active", series: "KX", event: "",
    ...o,
  };
};

describe("sortMarkets", () => {
  it("returns the input order unchanged when no key is set", () => {
    const rows = [m({ id: "a", volume: 1 }), m({ id: "b", volume: 9 })];
    expect(sortMarkets(rows, {}, { key: null, dir: "desc" }).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sorts by probability descending", () => {
    const rows = [m({ id: "lo", prob: 0.2 }), m({ id: "hi", prob: 0.9 }), m({ id: "mid", prob: 0.5 })];
    expect(sortMarkets(rows, {}, { key: "prob", dir: "desc" }).map((r) => r.id)).toEqual(["hi", "mid", "lo"]);
  });

  it("sorts resolves ascending (soonest first)", () => {
    const rows = [m({ id: "far", endDate: "2027-01-01" }), m({ id: "soon", endDate: "2026-08-10" })];
    expect(sortMarkets(rows, {}, { key: "resolves", dir: "asc" }).map((r) => r.id)).toEqual(["soon", "far"]);
  });

  it("sorts by 30d move using the moves map", () => {
    const rows = [m({ id: "up" }), m({ id: "down" })];
    const moves = { up: 0.12, down: -0.08 };
    expect(sortMarkets(rows, moves, { key: "move", dir: "desc" }).map((r) => r.id)).toEqual(["up", "down"]);
  });

  it("sinks null values to the bottom regardless of direction", () => {
    const rows = [m({ id: "none", prob: null }), m({ id: "has", prob: 0.4 })];
    expect(sortMarkets(rows, {}, { key: "prob", dir: "asc" }).map((r) => r.id)).toEqual(["has", "none"]);
    expect(sortMarkets(rows, {}, { key: "prob", dir: "desc" }).map((r) => r.id)).toEqual(["has", "none"]);
    // a market with no history sinks under "move" too
    const mv = [m({ id: "x", prob: 0.5 }), m({ id: "y", prob: 0.5 })];
    expect(sortMarkets(mv, { x: 0.05 }, { key: "move", dir: "desc" }).map((r) => r.id)).toEqual(["x", "y"]);
  });
});
