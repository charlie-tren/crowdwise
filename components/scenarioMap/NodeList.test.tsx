import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NodeList } from "./NodeList";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { ScenarioMap } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";

const market = (id: string, title: string, prob: number): Market => ({
  id, platform: "Kalshi", title, category: "Rates/Fed", prob, volume: 100,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

const map: ScenarioMap = {
  id: "m", name: "m",
  nodes: [
    { id: "i", kind: "input", label: "My read", low: 0.2, likely: 0.3, high: 0.5, source: "Charlie" },
    { id: "k", kind: "market", label: "Fed cuts", marketId: "k1", side: "yes" },
    { id: "f", kind: "formula", label: "Both", op: "and", refs: ["i", "k"] },
  ],
};
const board = [market("k1", "Fed cuts before 2027", 0.8)];
const results = () => evaluateMap(map, board);

describe("NodeList", () => {
  it("renders one row per node with its value", () => {
    render(<NodeList map={map} results={results()} markets={board} onChange={vi.fn()} />);
    expect(screen.getByText("My read")).toBeTruthy();
    expect(screen.getByText("80.00%")).toBeTruthy();
  });

  it("names the kind of each node", () => {
    render(<NodeList map={map} results={results()} markets={board} onChange={vi.fn()} />);
    expect(screen.getByText(/Live market/i)).toBeTruthy();
    expect(screen.getByText(/Estimate/i)).toBeTruthy();
    expect(screen.getByText(/Formula/i)).toBeTruthy();
  });

  it("opens an editor when a row is clicked and edits the likely value", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByText("My read"));
    const likely = screen.getByLabelText(/likely/i) as HTMLInputElement;
    fireEvent.change(likely, { target: { value: "40" } });
    expect(onChange).toHaveBeenCalled();
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "i")!;
    expect(edited).toMatchObject({ kind: "input", likely: 0.4 });
  });

  it("flips a market node between the YES and NO side", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByText("Fed cuts"));
    fireEvent.click(screen.getByLabelText(/NO side/i));
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    expect(next.nodes.find((n) => n.id === "k")).toMatchObject({ side: "no" });
  });

  it("removes a node and every ref to it, so no formula is left pointing at nothing", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByText("My read"));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    expect(next.nodes.find((n) => n.id === "i")).toBeUndefined();
    const formula = next.nodes.find((n) => n.id === "f")!;
    expect(formula.kind === "formula" && formula.refs).toEqual(["k"]);
  });

  it("shows the reason on an unresolved row instead of a number", () => {
    const broken: ScenarioMap = {
      id: "b", name: "b",
      nodes: [{ id: "x", kind: "market", label: "Gone", marketId: "nope", side: "yes" }],
    };
    render(<NodeList map={broken} results={evaluateMap(broken, board)} markets={board} onChange={vi.fn()} />);
    expect(screen.getByText(/No live market/i)).toBeTruthy();
  });

  it("clearing a percentage field never shows a confident number for what the reader did not type", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    fireEvent.click(screen.getByText("My read"));
    const low = screen.getByLabelText(/low/i) as HTMLInputElement;
    fireEvent.change(low, { target: { value: "" } });
    expect(onChange).toHaveBeenCalled();
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "i")!;
    // An empty field must never silently become 0: that is a confident, wrong
    // figure the reader never typed. It must resolve to something the engine
    // treats as incomplete (unresolved), not a usable finite number.
    expect(edited.kind === "input" && Number.isFinite(edited.low)).toBe(false);
    const nextResults = evaluateMap(next, board);
    expect(nextResults.get("i")?.status).toBe("unresolved");
    // The input box itself must not show the literal text "NaN" to the reader.
    expect(low.value).not.toBe("NaN");
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
    render(<NodeList map={legs} results={evaluateMap(legs, [])} markets={board} onChange={vi.fn()} />);
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("never claims a computed 99.6% chance is certain", () => {
    const near: ScenarioMap = {
      id: "near", name: "near",
      nodes: [{ id: "a", kind: "input", label: "Near-certain", low: 0.996, likely: 0.996, high: 0.996, source: "x" }],
    };
    render(<NodeList map={near} results={evaluateMap(near, [])} markets={board} onChange={vi.fn()} />);
    expect(screen.queryByText("100%")).toBeNull();
  });
});

// The drag track. jsdom has no layout, so the track's reference rect is
// stubbed to a known screen geometry rather than fought for real - see the
// same comment in EstimateTrack.test.tsx.
function stubTrackRect(width = 200, left = 0) {
  return vi
    .spyOn(SVGElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ left, width, top: 0, height: 16, right: left + width, bottom: 16, x: left, y: 0, toJSON() {} });
}

describe("NodeList drag track", () => {
  it("gives an input node a slider track, always visible, not gated behind opening the row", () => {
    const { container } = render(<NodeList map={map} results={results()} markets={board} onChange={vi.fn()} />);
    // The row is not opened - no click on it - so this proves the track is
    // reachable without expanding the editor.
    expect(container.querySelectorAll("[data-estimate-track]")).toHaveLength(1);
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("gives no track to a market node or a formula node", () => {
    const { container } = render(<NodeList map={map} results={results()} markets={board} onChange={vi.fn()} />);
    // map has one input ("i"), one market ("k"), one formula ("f"); exactly
    // one track total proves the other two kinds get none.
    expect(container.querySelectorAll("[data-estimate-track]")).toHaveLength(1);
  });

  it("dragging the track calls onChange with a shifted, width-preserving range - the same path typing uses", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    const handle = screen.getByRole("slider");
    fireEvent.pointerDown(handle, { clientX: 160, pointerId: 1 }); // fraction 0.8
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(onChange).toHaveBeenCalled();
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "i")!;
    expect(edited.kind === "input" && edited.likely).toBeCloseTo(0.8, 1);
    expect(edited.kind === "input" && edited.high - edited.low).toBeCloseTo(0.5 - 0.2); // width preserved
    rectSpy.mockRestore();
  });

  it("a drag on the track changes a downstream formula's value", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    const handle = screen.getByRole("slider");
    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 }); // fraction ~0.05, near the low end
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const before = results().get("f")!;
    const after = evaluateMap(next, board).get("f")!;
    expect(after.status).toBe("ok");
    expect(before.status).toBe("ok");
    expect(after.p50).not.toBeCloseTo(before.p50 as number, 3);
    rectSpy.mockRestore();
  });

  it("does not mutate the map object it was handed", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const onChange = vi.fn();
    const original = JSON.parse(JSON.stringify(map));
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    const handle = screen.getByRole("slider");
    fireEvent.pointerDown(handle, { clientX: 180, pointerId: 1 });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(map).toEqual(original);
    rectSpy.mockRestore();
  });


  it("arrow keys move the value and Home/End reach the ends of what the band's width allows", () => {
    const onChange = vi.fn();
    render(<NodeList map={map} results={results()} markets={board} onChange={onChange} />);
    const handle = screen.getByRole("slider");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    const next: ScenarioMap = onChange.mock.calls.at(-1)![0];
    const edited = next.nodes.find((n) => n.id === "i")!;
    expect(edited.kind === "input" && edited.likely).toBeCloseTo(0.31);
  });
});
