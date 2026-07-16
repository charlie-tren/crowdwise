import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProbBadge } from "./ProbBadge";

describe("ProbBadge", () => {
  it("renders the percentage", () => {
    render(<ProbBadge prob={0.9} />);
    expect(screen.getByText("90.0%")).toBeTruthy();
  });
  it("renders em dash for null", () => {
    render(<ProbBadge prob={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
