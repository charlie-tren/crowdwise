import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    // Proving containment, not just that some nested list exists somewhere:
    // the formula's own list item must have the input's label within its subtree.
    const formulaItem = screen.getByText("Both").closest("li");
    expect(formulaItem).toBeTruthy();
    expect(within(formulaItem as HTMLElement).getByText("Recession")).toBeTruthy();
  });

  it("shows a range only when the node has one", () => {
    const ranged: ScenarioMap = {
      id: "r", name: "r",
      nodes: [{ id: "a", kind: "input", label: "Wide", low: 0.1, likely: 0.5, high: 0.9, source: "x" }],
    };
    render(<MapOutline map={ranged} results={evaluateMap(ranged, [])} />);
    expect(screen.getByText(/to/)).toBeTruthy();
  });

  it("renders a node that reads itself, with its label and its circular reason", () => {
    const selfMap: ScenarioMap = {
      id: "s", name: "s",
      nodes: [{ id: "x", kind: "formula", label: "Self-fed", op: "not", refs: ["x"] }],
    };
    render(<MapOutline map={selfMap} results={evaluateMap(selfMap, [])} />);
    expect(screen.getByText("Self-fed")).toBeTruthy();
    expect(screen.getByText(/Circular: this node feeds itself/i)).toBeTruthy();
  });

  it("renders every node of a mutual cycle instead of an empty list", () => {
    const mutualMap: ScenarioMap = {
      id: "mc", name: "mc",
      nodes: [
        { id: "x", kind: "formula", label: "Reads Y", op: "not", refs: ["y"] },
        { id: "y", kind: "formula", label: "Reads X", op: "not", refs: ["x"] },
      ],
    };
    const { container } = render(<MapOutline map={mutualMap} results={evaluateMap(mutualMap, [])} />);
    // Neither node is a root here (each is read by the other), so the old code
    // rendered an empty <ul>. Both labels and both reasons must be present.
    expect(screen.getByText("Reads Y")).toBeTruthy();
    expect(screen.getByText("Reads X")).toBeTruthy();
    expect(screen.getAllByText(/Circular: this node feeds itself/i)).toHaveLength(2);
    expect(container.querySelector("ul")?.children.length).toBeGreaterThan(0);
  });

  it("renders each node of an ordinary acyclic map exactly once at the top level", () => {
    const { container } = render(<MapOutline map={map} results={evaluateMap(map, [])} />);
    // "f" is the only root ("a" and "b" are each read by "f"). The fix for the
    // cycle defect must not start re-adding nodes that the root walk already
    // reached, so exactly one top-level <li> should exist, for "f" alone.
    const topLevelUl = container.querySelector("ul.sm\\:hidden") as HTMLElement;
    const topLevelItems = Array.from(topLevelUl.children).filter((el) => el.tagName === "LI");
    expect(topLevelItems).toHaveLength(1);
    expect(within(topLevelItems[0] as HTMLElement).getByText("Both")).toBeTruthy();
    // getByText throws on more than one match, so this also proves "Both" is
    // not duplicated anywhere else in the tree.
    expect(screen.getByText("Both")).toBeTruthy();
  });
});
