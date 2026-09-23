import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapView } from "./MapView";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { ScenarioMap } from "@/lib/scenarioMap/types";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { Market } from "@/lib/types";

// jsdom has no layout and no ResizeObserver. Give the component a width the way a
// browser would, so the drawing path is the one under test.
beforeAll(() => {
  class RO {
    constructor(private cb: ResizeObserverCallback) {}
    observe() { this.cb([{ contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

const map: ScenarioMap = {
  id: "m", name: "m",
  nodes: [
    { id: "a", kind: "input", label: "Recession", low: 0.3, likely: 0.3, high: 0.3, source: "Charlie" },
    { id: "b", kind: "market", label: "Fed cuts", marketId: "gone", side: "yes" },
    { id: "f", kind: "formula", label: "Both", op: "and", refs: ["a", "b"] },
  ],
};

describe("MapView", () => {
  it("draws one group per node once a width is known", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(3);
  });

  it("draws one path per edge", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(container.querySelectorAll("[data-edge]")).toHaveLength(2);
  });

  it("labels the svg for a screen reader and does not claim to be an image", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).not.toBe("img");
    expect(svg.getAttribute("aria-label")).toMatch(/map/i);
  });

  it("prints the value on a resolved node and the reason on an unresolved one", () => {
    render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText(/No live market/i)).toBeTruthy();
  });

  it("colours a market node with its own theme colour from the board", () => {
    const board: Market[] = [{
      id: "k1", platform: "Kalshi", title: "Oil", category: "Commodities/Oil", prob: 0.5,
      volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "",
    }];
    const oil: ScenarioMap = {
      id: "o", name: "o",
      nodes: [{ id: "m", kind: "market", label: "Oil", marketId: "k1", side: "yes" }],
    };
    const { container } = render(<MapView map={oil} results={evaluateMap(oil, board)} markets={board} />);
    const rect = container.querySelector("[data-node] rect")!;
    expect(rect.getAttribute("stroke")).toBe(THEME_COLOURS["Commodities/Oil"]);
  });

  it("renders nothing but the measuring container when the width is zero", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} width={0} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("never claims a computed 0.45% chance cannot happen", () => {
    // 0.09 * 0.05: the Recession-in-2026 combined node.
    const legs: ScenarioMap = {
      id: "legs", name: "legs",
      nodes: [
        { id: "a", kind: "input", label: "Leg one", low: 0.09, likely: 0.09, high: 0.09, source: "x" },
        { id: "b", kind: "input", label: "Leg two", low: 0.05, likely: 0.05, high: 0.05, source: "x" },
        { id: "f", kind: "formula", label: "Combined", op: "and", refs: ["a", "b"] },
      ],
    };
    render(<MapView map={legs} results={evaluateMap(legs, [])} />);
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("never claims a computed 99.6% chance is certain", () => {
    const near: ScenarioMap = {
      id: "near", name: "near",
      nodes: [{ id: "a", kind: "input", label: "Near-certain", low: 0.996, likely: 0.996, high: 0.996, source: "x" }],
    };
    render(<MapView map={near} results={evaluateMap(near, [])} />);
    expect(screen.queryByText("100%")).toBeNull();
  });
});
