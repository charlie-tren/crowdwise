import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StrikeLadders } from "./StrikeLadders";
import type { StrikeLadder } from "@/lib/relativeValue";

const rung = (threshold: number, prob: number, id: string) => ({
  threshold,
  prob,
  id,
  series: "KX",
  title: `rung ${id}`,
  violation: false,
});

const ladder = (overrides: Partial<StrikeLadder> = {}): StrikeLadder => ({
  key: "k",
  metric: "CPI inflation",
  period: "2026-07",
  direction: "above",
  rungs: [rung(3.0, 0.6, "a"), rung(3.5, 0.4, "b"), rung(4.0, 0.2, "c")],
  hasViolation: false,
  volume: 3000,
  ...overrides,
});

describe("StrikeLadders", () => {
  it("renders a CPI rung with a percent sign, exactly as before", () => {
    render(<StrikeLadders ladders={[ladder()]} />);
    expect(screen.getByText("> 3%")).toBeTruthy();
    expect(screen.getByText("> 3.5%")).toBeTruthy();
    expect(screen.getByText("> 4%")).toBeTruthy();
  });

  it("renders an oil rung as a dollar price, never with a percent sign", () => {
    const oil = ladder({
      metric: "Oil price",
      rungs: [rung(114.99, 0.06, "a"), rung(115.99, 0.07, "b"), rung(116.99, 0.08, "c")],
    });
    render(<StrikeLadders ladders={[oil]} />);
    const label = screen.getByText("> $116.99");
    expect(label).toBeTruthy();
    expect(label.textContent).not.toContain("%");
    // and the whole ladder card carries no stray "116.99%" anywhere
    expect(screen.queryByText("> 116.99%")).toBeNull();
  });
});
