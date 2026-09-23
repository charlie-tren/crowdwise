import { describe, it, expect, beforeAll } from "vitest";
import { render, within } from "@testing-library/react";
import { MapView } from "./MapView";
import { MapOutline } from "./MapOutline";
import { NodeList } from "./NodeList";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { ScenarioMap } from "@/lib/scenarioMap/types";

/**
 * The picture (MapView), the narrow outline (MapOutline) and the editor
 * (NodeList) all print the same node values. If one rounds a probability
 * differently to the others, the same map disagrees with itself depending on
 * screen width or which panel is open - the exact inconsistency this feature
 * already guards against elsewhere. One formatter, used by all three, is
 * what keeps that from happening.
 */
beforeAll(() => {
  class RO {
    constructor(private cb: ResizeObserverCallback) {}
    observe() { this.cb([{ contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

// 0.09 * 0.05, the Recession-in-2026 combined leg: the live defect.
const legs: ScenarioMap = {
  id: "legs", name: "legs",
  nodes: [
    { id: "a", kind: "input", label: "Leg one", low: 0.09, likely: 0.09, high: 0.09, source: "x" },
    { id: "b", kind: "input", label: "Leg two", low: 0.05, likely: 0.05, high: 0.05, source: "x" },
    { id: "f", kind: "formula", label: "Combined", op: "and", refs: ["a", "b"] },
  ],
};

// The combined node's own group/row, wherever the panel puts it, scoped so a
// leg sharing the same "text-accent" class never collides with it.
function combinedValueIn(scope: HTMLElement): string | null | undefined {
  const group = Array.from(scope.querySelectorAll<HTMLElement>("[data-node], li, button"))
    .find((el) => within(el).queryByText("Combined"));
  // MapOutline and NodeList mark the value with the "text-accent" class;
  // MapView is SVG and carries no class, so its value text is the one at
  // font-weight 600 instead. Either way, the combined node's own printed
  // value, not a leg's.
  return group?.querySelector('.text-accent, text[font-weight="600"]')?.textContent;
}

describe("Scenario Map percentage consistency", () => {
  it("MapView and MapOutline print the identical string for the combined node", () => {
    const results = evaluateMap(legs, []);

    const view = render(<MapView map={legs} results={results} />);
    const viewText = combinedValueIn(view.container);
    view.unmount();

    const outline = render(<MapOutline map={legs} results={results} />);
    const outlineText = combinedValueIn(outline.container);
    outline.unmount();

    expect(viewText).toBeTruthy();
    expect(viewText).toBe(outlineText);
  });

  it("MapOutline and NodeList print the identical string for the combined node", () => {
    const results = evaluateMap(legs, []);

    const outline = render(<MapOutline map={legs} results={results} />);
    const outlineText = combinedValueIn(outline.container);
    outline.unmount();

    const list = render(<NodeList map={legs} results={results} markets={[]} onChange={() => {}} />);
    const listText = combinedValueIn(list.container);
    list.unmount();

    expect(outlineText).toBeTruthy();
    expect(outlineText).toBe(listText);
  });
});
