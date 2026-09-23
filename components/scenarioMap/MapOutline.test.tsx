import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapOutline } from "./MapOutline";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { ScenarioMap } from "@/lib/scenarioMap/types";

const map: ScenarioMap = {
  id: "m", name: "m",
  nodes: [
    { id: "a", kind: "input", label: "Recession", low: 0.3, likely: 0.3, high: 0.3, source: "Charlie" },
    { id: "b", kind: "market", label: "No market here", marketId: "gone", side: "yes" },
    { id: "f", kind: "formula", label: "Both", op: "and", refs: ["a", "b"] },
  ],
};

describe("MapOutline", () => {
  it("prints every node label", () => {
    render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    for (const label of ["Recession", "No market here", "Both"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("prints the value of a resolved node", () => {
    render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    expect(screen.getByText("30%")).toBeTruthy();
  });

  it("prints the reason instead of a number when a node is unresolved", () => {
    render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    expect(screen.getByText(/No live market/i)).toBeTruthy();
  });

  it("indents an input under the formula that reads it", () => {
    const { container } = render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    // The outline is rendered roots-last: a formula, then its inputs nested in a ul.
    expect(container.querySelectorAll("ul ul").length).toBeGreaterThan(0);
  });

  it("shows a range only when the node has one", () => {
    const ranged: ScenarioMap = {
      id: "r", name: "r",
      nodes: [{ id: "a", kind: "input", label: "Wide", low: 0.1, likely: 0.5, high: 0.9, source: "x" }],
    };
    render(<MapOutline map={ranged} results={evaluateMap(ranged, [])} />);
    expect(screen.getByText(/to/)).toBeTruthy();
  });
});
