import { describe, it, expect } from "vitest";
import { buildTreemap, buildScatter } from "./mapData";
import type { Market } from "./types";

const m = (id: string, cat: string, prob: number | null, vol: number): Market => ({
  id, platform: "Kalshi", title: `t-${id}`, category: cat as Market["category"], prob,
  volume: vol, endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

describe("buildTreemap", () => {
  it("groups qualifying markets by theme, caps to limit, drops prob/vol-less", () => {
    const mkts = [
      m("a", "Rates/Fed", 0.5, 100), m("b", "Rates/Fed", 0.8, 50),
      m("c", "Inflation", 0.3, 200), m("d", "Inflation", null, 999), // null prob dropped
      m("e", "Geopolitics", 0.6, 0), // zero volume dropped
    ];
    const nodes = buildTreemap(mkts, 45);
    const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));
    expect(Object.keys(byName).sort()).toEqual(["Inflation", "Rates/Fed"]); // Geopolitics + null dropped
    expect(byName["Rates/Fed"].children.map((l) => l.title).sort()).toEqual(["t-a", "t-b"]);
    expect(byName["Inflation"].children[0].size).toBe(200);
  });
  it("caps to the top N by volume across all markets", () => {
    const mkts = Array.from({ length: 60 }, (_, i) => m(`x${i}`, "Rates/Fed", 0.5, i + 1));
    const nodes = buildTreemap(mkts, 10);
    const total = nodes.reduce((acc, n) => acc + n.children.length, 0);
    expect(total).toBe(10); // only top 10 by volume kept
  });
});

describe("buildScatter", () => {
  it("keeps prob+vol markets, maps to x=prob%, y=volume", () => {
    const pts = buildScatter([m("a", "Rates/Fed", 0.5, 100), m("b", "Inflation", null, 5), m("c", "Inflation", 0.2, 0)]);
    expect(pts.length).toBe(1);
    expect(pts[0]).toMatchObject({ x: 50, y: 100, category: "Rates/Fed", title: "t-a" });
  });
});
