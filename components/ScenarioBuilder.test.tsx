import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioBuilder } from "./ScenarioBuilder";
import type { Market } from "@/lib/types";

const mk = (id: string, title: string, cat: string, prob: number): Market => ({
  id, platform: "Kalshi", title, category: cat as Market["category"], prob, volume: 100,
  endDate: "2026-12-31", status: "active", series: "KX", event: "",
});

describe("ScenarioBuilder", () => {
  it("computes joint and at-least-one for two picked legs", () => {
    render(<ScenarioBuilder markets={[mk("a", "Fed cut", "Rates/Fed", 0.5), mk("b", "Recession", "Growth/Recession", 0.4)]} />);
    fireEvent.click(screen.getByText(/Fed cut/));
    // Exact match (not regex): the category label "Growth/Recession" also
    // contains the substring "Recession", so a partial-match regex here
    // matches both the category span and the title span.
    fireEvent.click(screen.getByText("Recession"));
    expect(screen.getByText("20.0%")).toBeTruthy(); // joint 0.5*0.4
    expect(screen.getByText("70.0%")).toBeTruthy(); // at-least-one 1-(0.5*0.6)
  });
});
