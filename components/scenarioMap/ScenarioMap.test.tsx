import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ScenarioMap } from "./ScenarioMap";
import { encodeMap, loadSaved, STORAGE_KEY } from "@/lib/scenarioMap/codec";
import type { ScenarioMap as MapType } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";

beforeAll(() => {
  class RO {
    constructor(private cb: ResizeObserverCallback) {}
    observe() { this.cb([{ contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {} disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

const mk = (id: string, title: string, category: Market["category"], prob: number): Market => ({
  id, platform: "Kalshi", title, category, prob, volume: 1000,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

const board: Market[] = [
  mk("rec", "Will the US enter a recession in 2026?", "Growth/Recession", 0.3),
  mk("cut", "Fed cut rates before 2027", "Rates/Fed", 0.8),
];

// Sets the hash the way a same-document navigation would, then fires the
// event by hand rather than trusting jsdom to raise it off the assignment:
// this way the test proves the LISTENER works, not jsdom's location plumbing.
const setHashAndFire = (hash: string) => {
  window.location.hash = hash;
  // fireEvent, not a raw window.dispatchEvent: it wraps the dispatch in
  // act() so the resulting setState is flushed before the next assertion,
  // same as a browser's own hashchange delivery would be by the time script
  // after it runs.
  fireEvent(window, new Event("hashchange"));
};

describe("ScenarioMap", () => {
  beforeEach(() => { window.localStorage.clear(); window.location.hash = ""; });

  it("opens on a real map with live numbers, not an empty canvas", () => {
    render(<ScenarioMap markets={board} />);
    // getByDisplayValue, not getByText: the name is an input. And getAllByText for
    // the figure, because jsdom applies no CSS, so MapView and MapOutline BOTH
    // render and every number appears more than once.
    expect(screen.getByDisplayValue("Recession in 2026")).toBeTruthy();
    expect(screen.getAllByText("24.00%").length).toBeGreaterThan(0); // 0.3 * 0.8
  });

  it("does not write the default to the URL", () => {
    render(<ScenarioMap markets={board} />);
    expect(window.location.hash).toBe("");
  });

  it("switches map when another chip is pressed", () => {
    render(<ScenarioMap markets={board} />);
    // An exact-string role name matches the CHIP only: the node row's accessible
    // name is the whole row, label plus kind plus figure.
    fireEvent.click(screen.getByRole("button", { name: "Soft landing" }));
    expect(screen.getAllByText("56.00%").length).toBeGreaterThan(0); // 0.7 * 0.8
  });

  it("loads a map from the URL hash as an unsaved copy", () => {
    const shared: MapType = {
      id: "shared", name: "From a link",
      nodes: [{ id: "a", kind: "input", label: "A", low: 0.4, likely: 0.4, high: 0.4, source: "x" }],
    };
    window.location.hash = `#m=${encodeMap(shared)}`;
    render(<ScenarioMap markets={board} />);
    expect(screen.getByDisplayValue("From a link")).toBeTruthy();
    expect(loadSaved()).toEqual([]); // opening a link stores nothing
  });

  it("ignores a malformed hash and still renders the default", () => {
    window.location.hash = "#m=rubbish";
    render(<ScenarioMap markets={board} />);
    expect(screen.getByDisplayValue("Recession in 2026")).toBeTruthy();
  });

  it("saves an edited map under its own id, leaving the built-in alone", () => {
    render(<ScenarioMap markets={board} />);
    fireEvent.click(screen.getByRole("button", { name: /add estimate/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const saved = loadSaved();
    expect(saved).toHaveLength(1);
    expect(saved[0].builtIn).toBeUndefined();
    expect(saved[0].id).not.toBe("recession");
  });

  it("renders when localStorage throws", () => {
    // spyOn the prototype: assigning over window.localStorage.getItem is not
    // reliably permitted in jsdom, and a test that cannot arm itself proves nothing.
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => render(<ScenarioMap markets={board} />)).not.toThrow();
    spy.mockRestore();
  });

  it("starts a new map with one estimate node rather than a blank canvas", () => {
    render(<ScenarioMap markets={board} />);
    fireEvent.click(screen.getByRole("button", { name: /^new map$/i }));
    expect(screen.getByDisplayValue("Untitled map")).toBeTruthy();
    // getAllByText: "Add estimate" is on the page too.
    expect(screen.getAllByText(/Estimate/i).length).toBeGreaterThan(0);
  });

  it("keeps the storage key stable", () => {
    expect(STORAGE_KEY).toBe("crowdwise.scenarioMaps.v1");
  });

  it("loads a map when the hash changes on an already-open page", () => {
    render(<ScenarioMap markets={board} />);
    const shared: MapType = {
      id: "shared", name: "From a link, no reload",
      nodes: [{ id: "a", kind: "input", label: "A", low: 0.4, likely: 0.4, high: 0.4, source: "x" }],
    };
    setHashAndFire(`#m=${encodeMap(shared)}`);
    expect(screen.getByDisplayValue("From a link, no reload")).toBeTruthy();
  });

  it("does not write a map that arrived via hashchange to localStorage", () => {
    render(<ScenarioMap markets={board} />);
    const shared: MapType = {
      id: "shared", name: "From a link, no reload",
      nodes: [{ id: "a", kind: "input", label: "A", low: 0.4, likely: 0.4, high: 0.4, source: "x" }],
    };
    setHashAndFire(`#m=${encodeMap(shared)}`);
    // Confirm the map actually loaded first: an empty-localStorage assertion
    // alone would pass vacuously if the listener never fired at all.
    expect(screen.getByDisplayValue("From a link, no reload")).toBeTruthy();
    expect(loadSaved()).toEqual([]);
  });

  it("leaves the current map alone when the hash is emptied", () => {
    render(<ScenarioMap markets={board} />);
    const shared: MapType = {
      id: "shared", name: "From a link, no reload",
      nodes: [{ id: "a", kind: "input", label: "A", low: 0.4, likely: 0.4, high: 0.4, source: "x" }],
    };
    setHashAndFire(`#m=${encodeMap(shared)}`);
    expect(screen.getByDisplayValue("From a link, no reload")).toBeTruthy();
    // Clearing the fragment (eg. clicking a built-in chip elsewhere, then Back
    // past it) must not yank the reader away from what they are looking at,
    // and must not silently discard an unsaved edit.
    setHashAndFire("");
    expect(screen.getByDisplayValue("From a link, no reload")).toBeTruthy();
  });

  it("ignores a malformed hash arriving after mount and leaves the current map alone", () => {
    render(<ScenarioMap markets={board} />);
    const shared: MapType = {
      id: "shared", name: "From a link, no reload",
      nodes: [{ id: "a", kind: "input", label: "A", low: 0.4, likely: 0.4, high: 0.4, source: "x" }],
    };
    // Load a real shared map first, so this proves the listener ran and
    // REJECTED the bad hash, not just that nothing was listening at all.
    setHashAndFire(`#m=${encodeMap(shared)}`);
    expect(screen.getByDisplayValue("From a link, no reload")).toBeTruthy();
    setHashAndFire("#m=rubbish");
    expect(screen.getByDisplayValue("From a link, no reload")).toBeTruthy();
  });

  it("dragging an added estimate's track marks the map dirty, so Save forks the built-in", async () => {
    // The track's reference rect, stubbed the same way as EstimateTrack's own
    // tests - jsdom has no layout, and both MapView and NodeList read real
    // screen geometry off this element by design.
    const rectSpy = vi
      .spyOn(SVGElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ left: 0, width: 200, top: 0, height: 16, right: 200, bottom: 16, x: 0, y: 0, toJSON() {} } as DOMRect);

    render(<ScenarioMap markets={board} />);
    // Built-in maps carry no input node (their legs are all live markets), so
    // one has to be added before there is anything to drag.
    fireEvent.click(screen.getByRole("button", { name: /add estimate/i }));

    // Both MapView and NodeList render a track for the new node (they are
    // NOT gated behind opening the NodeList row), so there are two handles
    // for the same node; dragging either one goes through the same onChange.
    const handle = screen.getAllByRole("slider")[0];
    fireEvent.pointerDown(handle, { clientX: 180, pointerId: 1 }); // fraction 0.9, far past the default 0.35
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const saved = loadSaved();
    expect(saved).toHaveLength(1);
    // Forked, not overwriting the built-in: proves the drag kept the map
    // marked dirty against a built-in exactly as typing into the node list does.
    expect(saved[0].builtIn).toBeUndefined();
    expect(saved[0].id).not.toBe("recession");
    const draggedNode = saved[0].nodes.find((n) => n.kind === "input")!;
    // And the SAVED node carries the post-drag value, not the 0.35 it had the
    // moment "Add estimate" was clicked - proving the drag's data, not just
    // the dirty flag, reached what got saved.
    expect(draggedNode.kind === "input" && draggedNode.likely).toBeGreaterThan(0.5);

    rectSpy.mockRestore();
  });

  it("removes the hashchange listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<ScenarioMap markets={board} />);
    const registered = addSpy.mock.calls.find((c) => c[0] === "hashchange");
    expect(registered).toBeTruthy();
    unmount();
    expect(removeSpy.mock.calls.some((c) => c[0] === "hashchange" && c[1] === registered?.[1])).toBe(true);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
