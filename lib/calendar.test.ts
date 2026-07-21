import { describe, it, expect } from "vitest";
import { buildEventCalendar } from "./calendar";
import type { Market } from "./types";

let seq = 0;
const m = (overrides: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`, platform: "Kalshi", title: "Untitled", category: "Rates/Fed",
    prob: 0.5, volume: 1000, endDate: "2026-08-01", status: "active", series: "KX", event: "",
    ...overrides,
  };
};

describe("buildEventCalendar", () => {
  it("clusters by day, headlines the biggest market, sorts soonest-first", () => {
    const out = buildEventCalendar(
      [
        m({ endDate: "2026-07-29", title: "FOMC small", volume: 100 }),
        m({ endDate: "2026-07-29", title: "FOMC big", volume: 900 }),
        m({ endDate: "2026-08-12", title: "CPI print", volume: 500, category: "Inflation" }),
      ],
      "2026-07-20",
    );
    expect(out.map((e) => e.date)).toEqual(["2026-07-29", "2026-08-12"]);
    expect(out[0].label).toBe("FOMC big");
    expect(out[0].count).toBe(2);
    expect(out[0].volume).toBe(1000);
    expect(out[0].daysAway).toBe(9);
    expect(out[1].category).toBe("Inflation");
  });

  it("drops past resolutions and prob-less markets", () => {
    const out = buildEventCalendar(
      [
        m({ endDate: "2026-07-01", title: "already resolved" }), // past
        m({ endDate: "2026-08-01", title: "no prob", prob: null }), // excluded
        m({ endDate: "2026-08-05", title: "future" }),
      ],
      "2026-07-20",
    );
    expect(out.map((e) => e.label)).toEqual(["future"]);
  });

  it("limits to the next N events", () => {
    const markets = Array.from({ length: 20 }, (_, i) =>
      m({ endDate: `2026-08-${String(i + 1).padStart(2, "0")}`, title: `day ${i}` }),
    );
    expect(buildEventCalendar(markets, "2026-07-20", 5)).toHaveLength(5);
  });
});
