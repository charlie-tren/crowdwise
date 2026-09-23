import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("ScenarioMap", () => {
  beforeEach(() => { window.localStorage.clear(); window.location.hash = ""; });

  it("opens on a real map with live numbers, not an empty canvas", () => {
    render(<ScenarioMap markets={board} />);
    // getByDisplayValue, not getByText: the name is an input. And getAllByText for
    // the figure, because jsdom applies no CSS, so MapView and MapOutline BOTH
    // render and every number appears more than once.
    expect(screen.getByDisplayValue("Recession in 2026")).toBeTruthy();
    expect(screen.getAllByText("24%").length).toBeGreaterThan(0); // 0.3 * 0.8
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
    expect(screen.getAllByText("56%").length).toBeGreaterThan(0); // 0.7 * 0.8
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
});
