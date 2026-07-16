import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BoardView } from "./BoardView";
import type { BoardPayload } from "@/lib/types";

const payload: BoardPayload = {
  fetchedAt: "2026-07-15T10:00:00",
  moves: { a: 0.05 },
  markets: [
    { id: "a", platform: "Kalshi", title: "Fed cut in March?", category: "Rates/Fed", prob: 0.6, volume: 1000, endDate: "2026-03-18", status: "active", series: "KXFED", event: "E1" },
    { id: "b", platform: "Polymarket", title: "US recession in 2026?", category: "Growth/Recession", prob: 0.3, volume: 5000, endDate: "2026-12-31", status: "active", series: "", event: "" },
  ],
};

describe("BoardView", () => {
  it("renders both markets initially", () => {
    render(<BoardView initial={payload} />);
    expect(screen.getByText(/Fed cut in March/)).toBeTruthy();
    expect(screen.getByText(/US recession in 2026/)).toBeTruthy();
  });
  it("search narrows results", () => {
    render(<BoardView initial={payload} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "recession" } });
    expect(screen.queryByText(/Fed cut in March/)).toBeNull();
    expect(screen.getByText(/US recession in 2026/)).toBeTruthy();
  });
});
