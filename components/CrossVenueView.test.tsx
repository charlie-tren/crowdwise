import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrossVenueView } from "./CrossVenueView";
import type { CrossVenuePair } from "@/lib/crossVenue";
import type { Market } from "@/lib/types";

let seq = 0;
const market = (o: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`, platform: "Kalshi", title: "x", category: "Rates/Fed",
    prob: 0.5, volume: 1000, endDate: "2026-09-16", status: "active", series: "KX", event: "",
    ...o,
  };
};

const pair = (o: Partial<CrossVenuePair> = {}): CrossVenuePair => ({
  type: "fed",
  key: "fed|2026|cut|any",
  label: "At least one Fed cut in 2026",
  kalshi: market({ platform: "Kalshi", title: "Will the Federal Reserve cut rates before 2027?" }),
  polymarket: market({ platform: "Polymarket", title: "Will no Fed rate cuts happen in 2026?" }),
  kalshiProb: 0.054,
  polymarketProb: 0.035,
  kalshiInverted: false,
  polymarketInverted: true,
  divergence: 0.019,
  ...o,
});

describe("CrossVenueView", () => {
  it("marks the inverted side as 'NO side' so a reader who clicks through finds the number the venue actually quotes", () => {
    render(<CrossVenueView pairs={[pair()]} />);
    expect(screen.getByText("NO side")).toBeTruthy();
  });

  it("does not mark a non-inverted side", () => {
    render(
      <CrossVenueView
        pairs={[pair({ polymarketInverted: false, kalshiInverted: false })]}
      />,
    );
    expect(screen.queryByText("NO side")).toBeNull();
  });

  it("marks both sides when both are inverted", () => {
    render(
      <CrossVenueView
        pairs={[pair({ kalshiInverted: true, polymarketInverted: true })]}
      />,
    );
    expect(screen.getAllByText("NO side")).toHaveLength(2);
  });

  it("still shows the comparable (already polarity-adjusted) percentage, not just the label", () => {
    render(<CrossVenueView pairs={[pair()]} />);
    // 3.5%, not 96.5% - the raw Polymarket quote for "no cuts" - would be shown
    expect(screen.getByText("3.5%")).toBeTruthy();
  });
});
