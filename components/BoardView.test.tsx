import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BoardView } from "./BoardView";
import type { BoardPayload } from "@/lib/types";

// Dates relative to now so both markets land in VISIBLE (non-collapsed) windows
// regardless of when the suite runs: "a" this week, "b" this quarter. (The board
// now groups by resolution window and collapses the Long-dated section by default,
// so a fixed past date would sink out of view.)
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const payload: BoardPayload = {
  fetchedAt: "2026-07-15T10:00:00",
  moves: { a: 0.05 },
  markets: [
    { id: "a", platform: "Kalshi", title: "Fed cut in March?", category: "Rates/Fed", prob: 0.6, volume: 1000, endDate: iso(3), status: "active", series: "KXFED", event: "E1" },
    { id: "b", platform: "Polymarket", title: "US recession in 2026?", category: "Growth/Recession", prob: 0.3, volume: 5000, endDate: iso(60), status: "active", series: "", event: "" },
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
