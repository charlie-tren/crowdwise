import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProbBadge } from "./ProbBadge";

describe("ProbBadge", () => {
  it("renders the percentage and colour band", () => {
    render(<ProbBadge prob={0.9} />);
    const el = screen.getByText("90.0%");
    expect(el).toBeTruthy();
    const c = el.style.color.replace(/\s/g, "").toLowerCase();
    // jsdom may serialise the inline colour as hex or rgb; accept either.
    expect(c === "#ef4444" || c === "rgb(239,68,68)").toBe(true);
  });
  it("renders em dash for null", () => {
    render(<ProbBadge prob={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
