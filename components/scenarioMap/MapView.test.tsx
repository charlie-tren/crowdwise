import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapView, wrapLabel } from "./MapView";
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

// A `depends` map's whole point is contrasting two conditional branches. When
// both truncate to the same 22 characters ("Recession, if the Fed…") the
// reader cannot tell the boxes apart. wrapLabel is the pure, unit-testable
// helper that fixes this: two lines instead of one, wrapped on word
// boundaries, truncated with an ellipsis only if it still overflows.
describe("wrapLabel", () => {
  it("wraps the two Fed-conditional labels into different lines", () => {
    const cuts = wrapLabel("Recession, if the Fed cuts");
    const holds = wrapLabel("Recession, if the Fed holds all year");
    expect(cuts.join("\n")).not.toBe(holds.join("\n"));
    // Both must fit without an ellipsis: the source text says "both labels
    // above fit comfortably in two lines".
    expect(cuts.some((l) => l.includes("…"))).toBe(false);
    expect(holds.some((l) => l.includes("…"))).toBe(false);
  });

  it("leaves a short label on one line, with no spurious second line", () => {
    expect(wrapLabel("Recession")).toEqual(["Recession"]);
  });

  it("truncates a single word with no space to break on, rather than overflowing", () => {
    const longWord = "Supercalifragilisticexpialidocioussupercalifragilisticexpialidocious";
    const lines = wrapLabel(longWord);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(22);
    expect(lines[lines.length - 1].endsWith("…")).toBe(true);
  });

  it("does not throw on an empty label", () => {
    expect(() => wrapLabel("")).not.toThrow();
    expect(wrapLabel("")).toEqual([]);
  });
});

describe("MapView two-line labels", () => {
  const fedMap: ScenarioMap = {
    id: "fed", name: "fed",
    nodes: [
      { id: "cuts", kind: "input", label: "Recession, if the Fed cuts", low: 0.1, likely: 0.1, high: 0.1, source: "x" },
      { id: "holds", kind: "input", label: "Recession, if the Fed holds all year", low: 0.2, likely: 0.2, high: 0.2, source: "x" },
    ],
  };

  it("renders the two Fed-conditional nodes with different visible text", () => {
    const { container } = render(<MapView map={fedMap} results={evaluateMap(fedMap, [])} />);
    const groups = container.querySelectorAll("[data-node]");
    expect(groups).toHaveLength(2);
    const textOf = (g: Element) => g.querySelector("text")!.textContent;
    expect(textOf(groups[0])).not.toBe(textOf(groups[1]));
  });

  it("does not throw and renders no label text for an empty label", () => {
    const emptyLabel: ScenarioMap = {
      id: "e", name: "e",
      nodes: [{ id: "a", kind: "input", label: "", low: 0.1, likely: 0.1, high: 0.1, source: "x" }],
    };
    expect(() => render(<MapView map={emptyLabel} results={evaluateMap(emptyLabel, [])} />)).not.toThrow();
  });
});
