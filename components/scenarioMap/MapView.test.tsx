import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    expect(screen.getByText("30.00%")).toBeTruthy();
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

// A real browser was observed laying the container out correctly at 1086px
// while its ResizeObserver simply never delivered a callback - no error, no
// message, just a blank panel. These tests cover the synchronous fallback:
// the first paint must not depend on the observer firing at all.
describe("MapView measurement fallback", () => {
  // Captured per-test (not once at describe-body evaluation, which runs
  // before the file's beforeAll has set the default stub) so each test
  // restores exactly what it found, and later describe blocks still see
  // the beforeAll stub.
  let originalRO: unknown;

  beforeEach(() => {
    originalRO = (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalRO;
  });

  it("draws the map from a synchronous measurement when the observer never fires", () => {
    class SilentRO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = SilentRO;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 900 } as DOMRect);

    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(3);

    rectSpy.mockRestore();
  });

  it("does not throw and still draws when ResizeObserver is entirely undefined", () => {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 900 } as DOMRect);

    let container!: HTMLElement;
    expect(() => {
      container = render(<MapView map={map} results={evaluateMap(map, [])} />).container;
    }).not.toThrow();
    expect(container.querySelectorAll("[data-node]")).toHaveLength(3);

    rectSpy.mockRestore();
  });

  it("still renders no svg when the synchronous measurement is zero, as with a CSS-hidden container", () => {
    class SilentRO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = SilentRO;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 0 } as DOMRect);

    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} />);
    expect(container.querySelector("svg")).toBeNull();

    rectSpy.mockRestore();
  });

  it("lets an explicit width win and skips the observer entirely", () => {
    let constructed = false;
    class SpyRO {
      constructor() {
        constructed = true;
      }
      observe() {
        constructed = true;
      }
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = SpyRO;

    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} width={640} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(3);
    expect(constructed).toBe(false);
  });
});

describe("MapView drag track", () => {
  function stubTrackRect(width = 100, left = 0) {
    return vi
      .spyOn(SVGElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ left, width, top: 0, height: 16, right: left + width, bottom: 16, x: left, y: 0, toJSON() {} });
  }

  it("gives only the input node a track: none on the market or formula node", () => {
    const { container } = render(<MapView map={map} results={evaluateMap(map, [])} onChange={vi.fn()} />);
    // map (top of file) has one input ("a"), one market ("b"), one formula ("f").
    expect(container.querySelectorAll("[data-estimate-track]")).toHaveLength(1);
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("dragging the handle calls onChange with a shifted, width-preserving range", async () => {
    const rectSpy = stubTrackRect(100, 0);
    const onChange = vi.fn();
    render(<MapView map={map} results={evaluateMap(map, [])} onChange={onChange} />);
    const handle = screen.getByRole("slider");
    fireEvent.pointerDown(handle, { clientX: 60, pointerId: 1 }); // fraction 0.6
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(onChange).toHaveBeenCalled();
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "a")!;
    // node "a" starts with low = likely = high = 0.3 (a zero-width estimate),
    // so a correct shift-together moves all three to the same new value.
    expect(edited.kind === "input" && edited.likely).toBeCloseTo(0.6, 1);
    expect(edited.kind === "input" && edited.low).toBeCloseTo(0.6, 1);
    expect(edited.kind === "input" && edited.high).toBeCloseTo(0.6, 1);
    rectSpy.mockRestore();
  });

  it("does not mutate the map object it was handed", async () => {
    const rectSpy = stubTrackRect(100, 0);
    const original = JSON.parse(JSON.stringify(map));
    render(<MapView map={map} results={evaluateMap(map, [])} onChange={vi.fn()} />);
    const handle = screen.getByRole("slider");
    fireEvent.pointerDown(handle, { clientX: 90, pointerId: 1 });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(map).toEqual(original);
    rectSpy.mockRestore();
  });

  it("renders without an onChange prop, for a read-only caller", () => {
    expect(() => render(<MapView map={map} results={evaluateMap(map, [])} />)).not.toThrow();
  });
});

describe("MapView market override", () => {
  const board: Market[] = [{
    id: "k1", platform: "Kalshi", title: "Recession", category: "Growth/Recession", prob: 0.09,
    volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "",
  }];
  const recessionMap: ScenarioMap = {
    id: "r", name: "r",
    nodes: [{ id: "rec", kind: "market", label: "Recession", marketId: "k1", side: "yes" }],
  };

  function stubTrackRect(width = 100, left = 0) {
    return vi
      .spyOn(SVGElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ left, width, top: 0, height: 16, right: left + width, bottom: 16, x: left, y: 0, toJSON() {} });
  }

  it("gives a market node with a live price a track, same as an input node - this is the whole point", () => {
    const { container } = render(
      <MapView map={recessionMap} results={evaluateMap(recessionMap, board)} markets={board} onChange={vi.fn()} />,
    );
    expect(container.querySelectorAll("[data-estimate-track]")).toHaveLength(1);
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("gives no track to a market node with no live price on the board", () => {
    const gone: ScenarioMap = {
      id: "g", name: "g",
      nodes: [{ id: "rec", kind: "market", label: "Recession", marketId: "gone", side: "yes" }],
    };
    const { container } = render(
      <MapView map={gone} results={evaluateMap(gone, board)} markets={board} onChange={vi.fn()} />,
    );
    expect(container.querySelectorAll("[data-estimate-track]")).toHaveLength(0);
  });

  it("dragging a market node's track sets an override, not the live price", async () => {
    const rectSpy = stubTrackRect(100, 0);
    const onChange = vi.fn();
    render(<MapView map={recessionMap} results={evaluateMap(recessionMap, board)} markets={board} onChange={onChange} />);
    const handle = screen.getByRole("slider");
    fireEvent.pointerDown(handle, { clientX: 90, pointerId: 1 }); // fraction 0.9
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(onChange).toHaveBeenCalled();
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "rec")!;
    expect(edited.kind === "market" && edited.override).toBeCloseTo(0.9, 1);
    // The live board price is never touched by the drag itself.
    rectSpy.mockRestore();
  });

  it("shows both the what-if figure and the live price, clearly different numbers", () => {
    const overridden: ScenarioMap = {
      id: "r", name: "r",
      nodes: [{ id: "rec", kind: "market", label: "Recession", marketId: "k1", side: "yes", override: 0.6 }],
    };
    render(<MapView map={overridden} results={evaluateMap(overridden, board)} markets={board} />);
    expect(screen.getByText("60.00%")).toBeTruthy(); // the what-if, the node's own figure
    expect(screen.getByText(/9\.00%/)).toBeTruthy(); // the live price, subordinate
  });

  it("clicking the live price clears the override and returns the node to it", () => {
    const overridden: ScenarioMap = {
      id: "r", name: "r",
      nodes: [{ id: "rec", kind: "market", label: "Recession", marketId: "k1", side: "yes", override: 0.6 }],
    };
    const onChange = vi.fn();
    render(<MapView map={overridden} results={evaluateMap(overridden, board)} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /live/i }));
    expect(onChange).toHaveBeenCalled();
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "rec")!;
    expect(edited.kind === "market" && edited.override).toBeUndefined();
  });

  it("does not show a live-price reset when there is no override to clear", () => {
    render(<MapView map={recessionMap} results={evaluateMap(recessionMap, board)} markets={board} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /live/i })).toBeNull();
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
