import { describe, it, expect } from "vitest";
import { headlineOdds, fedHeadlineTile, fedDistribution, fedPath, fedMeetingGrid, displayTitle } from "./highlights";
import type { Market } from "./types";

let seq = 0;
const m = (overrides: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`,
    platform: "Kalshi",
    title: "Untitled",
    category: "Rates/Fed",
    prob: 0.5,
    volume: 1000,
    endDate: "2026-09-16",
    status: "active",
    series: "KX",
    event: "",
    ...overrides,
  };
};

describe("headlineOdds", () => {
  it("picks the highest-volume market per requested theme, in order", () => {
    const tiles = headlineOdds(
      [
        m({ category: "Rates/Fed", title: "Fed small", volume: 100, prob: 0.6 }),
        m({ category: "Rates/Fed", title: "Fed big", volume: 900, prob: 0.7 }),
        m({ category: "Growth/Recession", title: "Recession", volume: 500, prob: 0.3 }),
      ],
      ["Rates/Fed", "Growth/Recession"],
    );
    expect(tiles.map((t) => t.title)).toEqual(["Fed big", "Recession"]);
    expect(tiles[0].prob).toBe(0.7);
  });

  it("prefers a clean directional market over a narrow strike/bucket one", () => {
    const tiles = headlineOdds(
      [
        m({ category: "Growth/Recession", title: "When will the next U.S. recession start?", volume: 900, prob: 0.02 }),
        m({ category: "Growth/Recession", title: "US recession in 2026?", volume: 300, prob: 0.4 }),
      ],
      ["Growth/Recession"],
    );
    expect(tiles[0].title).toBe("US recession in 2026?");
  });

  it("excludes retrospective 'when will the next ... start?' buckets so a current indicator headlines even at far lower volume", () => {
    const tiles = headlineOdds(
      [
        m({ category: "Growth/Recession", title: "When will the next U.S. recession start?", volume: 130000, prob: 0.02 }),
        m({ category: "Growth/Recession", title: "When will the next U.S. recession start?", volume: 96000, prob: 0.03 }),
        m({ category: "Growth/Recession", title: "ISM Manufacturing PMI in July 2026?", volume: 3000, prob: 0.57 }),
      ],
      ["Growth/Recession"],
    );
    expect(tiles[0].title).toBe("ISM Manufacturing PMI in July 2026?");
  });

  it("prefers a current narrow indicator over a retrospective bucket when no clean market exists", () => {
    const tiles = headlineOdds(
      [
        m({ category: "Growth/Recession", title: "When will the next U.S. recession start?", volume: 130000, prob: 0.02 }),
        m({ category: "Growth/Recession", title: "Will real GDP increase by more than 2.5% in Q2 2026?", volume: 54000, prob: 0.6 }),
      ],
      ["Growth/Recession"],
    );
    expect(tiles[0].title).toBe("Will real GDP increase by more than 2.5% in Q2 2026?");
  });

  it("still emits a tile if a theme has ONLY retrospective markets (never drops the theme)", () => {
    const tiles = headlineOdds(
      [m({ category: "Growth/Recession", title: "When will the next U.S. recession start?", volume: 100, prob: 0.05 })],
      ["Growth/Recession"],
    );
    expect(tiles).toHaveLength(1);
  });

  it("cleans a Fed hold market's awkward title for the hero tile", () => {
    const tiles = headlineOdds(
      [m({ category: "Rates/Fed", title: "Will the Federal Reserve Hike rates by 0bps at their July 2026 meeting?", endDate: "2026-07-29", volume: 5000, prob: 0.76 })],
      ["Rates/Fed"],
    );
    expect(tiles[0].title).toBe("Fed holds at the Jul 2026 meeting");
    expect(tiles[0].prob).toBe(0.76);
    expect(tiles[0].id).toBe(tiles[0].id); // id/link unchanged - still the same market
  });

  it("cleans a Fed hike headline title with bps", () => {
    const tiles = headlineOdds(
      [m({ category: "Rates/Fed", title: "Will the Federal Reserve Hike rates by 25bps at their September 2026 meeting?", endDate: "2026-09-16", volume: 5000, prob: 0.3 })],
      ["Rates/Fed"],
    );
    expect(tiles[0].title).toBe("Fed hikes 25bps at the Sep 2026 meeting");
  });

  it("leaves a non-Fed headline title untouched", () => {
    const tiles = headlineOdds(
      [m({ category: "Inflation", title: "Will CPI inflation be above 3.4% for the year ending July 2026?", volume: 5000, prob: 0.28 })],
      ["Inflation"],
    );
    expect(tiles[0].title).toBe("Will CPI inflation be above 3.4% for the year ending July 2026?");
  });

  it("falls back to top volume when every market in a theme is narrow", () => {
    const tiles = headlineOdds(
      [
        m({ category: "Inflation", title: "Will CPI be above 3.5%?", volume: 100, prob: 0.2 }),
        m({ category: "Inflation", title: "Will CPI be above 4.0%?", volume: 500, prob: 0.1 }),
      ],
      ["Inflation"],
    );
    expect(tiles[0].title).toBe("Will CPI be above 4.0%?");
  });

  it("skips themes with no priced market and ignores prob-less markets", () => {
    const tiles = headlineOdds(
      [
        m({ category: "Rates/Fed", prob: null, volume: 999 }),
        m({ category: "Inflation", title: "CPI", prob: 0.44, volume: 200 }),
      ],
      ["Rates/Fed", "Inflation"],
    );
    expect(tiles).toHaveLength(1);
    expect(tiles[0].title).toBe("CPI");
  });
});

describe("fedHeadlineTile", () => {
  const dist = {
    ym: "2026-07",
    total: 1.05,
    outcomes: [
      { label: "Cut 25", action: "cut", bps: 25, prob: 0.01, id: "KX-C25" },
      { label: "Hold", action: "hold", bps: 0, prob: 0.77, id: "KX-HOLD" },
      { label: "Hike 25", action: "hike", bps: 25, prob: 0.24, id: "KX-H25" },
    ],
  } as any;

  it("returns the modal outcome as a Kalshi tile consistent with the distribution", () => {
    const markets = [{ id: "KX-HOLD", volume: 5000 }] as any;
    const tile = fedHeadlineTile(dist, markets);
    expect(tile).not.toBeNull();
    expect(tile!.id).toBe("KX-HOLD"); // modal (highest prob)
    expect(tile!.prob).toBeCloseTo(0.77); // matches the distribution's Hold
    expect(tile!.platform).toBe("Kalshi");
    expect(tile!.volume).toBe(5000);
    expect(tile!.title).toBe("Fed holds at the Jul 2026 meeting");
  });

  it("volume falls back to 0 if the market isn't found", () => {
    expect(fedHeadlineTile(dist, [] as any)!.volume).toBe(0);
  });

  it("null when there is no distribution", () => {
    expect(fedHeadlineTile(null, [] as any)).toBeNull();
  });
});

describe("fedDistribution", () => {
  const meeting = (title: string, prob: number, volume = 1000, ym = "2026-09") =>
    m({ platform: "Kalshi", title, prob, volume, endDate: `${ym}-16` });

  it("builds the nearest-meeting outcome distribution sorted cut->hold->hike", () => {
    const dist = fedDistribution(
      [
        meeting("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.55),
        meeting("Will the Fed Hike rates by 0bps at their September 2026 meeting?", 0.4),
        meeting("Will the Fed Hike rates by 25bps at their September 2026 meeting?", 0.05),
      ],
      "2026-01",
    );
    expect(dist).not.toBeNull();
    expect(dist!.ym).toBe("2026-09");
    expect(dist!.outcomes.map((o) => o.label)).toEqual(["Cut 25", "Hold", "Hike 25"]);
    expect(dist!.total).toBeCloseTo(1.0, 5);
  });

  // The open-ended bucket rendered as a bare "Hike >" in the grid's key - a
  // comparator with nothing after it. fedTileTitle had been rendering the same
  // market correctly as ">25bps" all along, so the threshold was parsed and only
  // this label dropped it.
  it("names what the open-ended bucket is greater THAN", () => {
    const dist = fedDistribution(
      [
        meeting("Will the Fed Hike rates by 0bps at their September 2026 meeting?", 0.5),
        meeting("Will the Fed Hike rates by 25bps at their September 2026 meeting?", 0.3),
        meeting("Will the Fed Hike rates by more than 25bps at their September 2026 meeting?", 0.2),
      ],
      "2026-01",
    );
    expect(dist!.outcomes.map((o) => o.label)).toEqual(["Hold", "Hike 25", "Hike >25"]);
    expect(dist!.outcomes.map((o) => o.label)).not.toContain("Hike >");
  });


  it("selects the nearest upcoming meeting, not a past one", () => {
    const dist = fedDistribution(
      [
        meeting("Will the Fed Cut rates by 25bps at their July 2026 meeting?", 0.9, 1000, "2026-07"),
        meeting("Will the Fed Hike rates by 0bps at their July 2026 meeting?", 0.1, 1000, "2026-07"),
        meeting("Will the Fed Cut rates by 25bps at their December 2026 meeting?", 0.5, 1000, "2026-12"),
        meeting("Will the Fed Hike rates by 0bps at their December 2026 meeting?", 0.5, 1000, "2026-12"),
      ],
      "2026-09",
    );
    expect(dist!.ym).toBe("2026-12");
  });

  it("returns null when fewer than two outcomes are priced", () => {
    const dist = fedDistribution(
      [meeting("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.55)],
      "2026-01",
    );
    expect(dist).toBeNull();
  });

  it("takes the highest-volume market for each outcome", () => {
    const dist = fedDistribution(
      [
        meeting("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.5, 100),
        meeting("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.6, 900),
        meeting("Will the Fed Hike rates by 0bps at their September 2026 meeting?", 0.4, 500),
      ],
      "2026-01",
    );
    const cut = dist!.outcomes.find((o) => o.label === "Cut 25");
    expect(cut!.prob).toBe(0.6);
  });
});

describe("fedPath", () => {
  const mk = (title: string, prob: number, ym: string, volume = 1000) =>
    m({ platform: "Kalshi", title, prob, volume, endDate: `${ym}-16` });

  it("accumulates probability-weighted expected bps across meetings", () => {
    const path = fedPath(
      [
        // Sep: 55% cut25, 40% hold, 5% hike25 -> E = -12.5bps
        mk("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.55, "2026-09"),
        mk("Will the Fed Hike rates by 0bps at their September 2026 meeting?", 0.4, "2026-09"),
        mk("Will the Fed Hike rates by 25bps at their September 2026 meeting?", 0.05, "2026-09"),
        // Dec: 60% cut25, 40% hold -> E = -15bps ; cumulative -27.5
        mk("Will the Fed Cut rates by 25bps at their December 2026 meeting?", 0.6, "2026-12"),
        mk("Will the Fed Hike rates by 0bps at their December 2026 meeting?", 0.4, "2026-12"),
      ],
      "2026-01",
    );
    expect(path.map((p) => p.ym)).toEqual(["2026-09", "2026-12"]);
    expect(path[0].expectedBps).toBeCloseTo(-12.5, 1);
    expect(path[0].cumulativeBps).toBeCloseTo(-12.5, 1);
    expect(path[1].expectedBps).toBeCloseTo(-15, 1);
    expect(path[1].cumulativeBps).toBeCloseTo(-27.5, 1);
  });

  it("skips a meeting with a single priced outcome and drops past meetings", () => {
    const path = fedPath(
      [
        mk("Will the Fed Cut rates by 25bps at their July 2026 meeting?", 0.9, "2026-07"), // past + single
        mk("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.5, "2026-09"), // single -> skipped
        mk("Will the Fed Cut rates by 25bps at their December 2026 meeting?", 0.6, "2026-12"),
        mk("Will the Fed Hike rates by 0bps at their December 2026 meeting?", 0.4, "2026-12"),
      ],
      "2026-08",
    );
    expect(path.map((p) => p.ym)).toEqual(["2026-12"]);
  });
});

describe("fedMeetingGrid", () => {
  const mk = (title: string, prob: number, ym: string) =>
    m({ platform: "Kalshi", title, prob, volume: 1000, endDate: `${ym}-16` });

  it("returns per-meeting outcome distributions for upcoming meetings only", () => {
    const grid = fedMeetingGrid(
      [
        mk("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.5, "2026-09"),
        mk("Will the Fed Hike rates by 0bps at their September 2026 meeting?", 0.5, "2026-09"),
        mk("Will the Fed Cut rates by 25bps at their December 2026 meeting?", 0.6, "2026-12"),
        mk("Will the Fed Hike rates by 0bps at their December 2026 meeting?", 0.4, "2026-12"),
        mk("Will the Fed Cut rates by 25bps at their June 2026 meeting?", 0.9, "2026-06"), // past
        mk("Will the Fed Hike rates by 0bps at their June 2026 meeting?", 0.1, "2026-06"),
      ],
      "2026-08",
    );
    expect(grid.map((g) => g.ym)).toEqual(["2026-09", "2026-12"]);
    expect(grid[0].label).toBe("Sep 2026");
    expect(grid[0].outcomes.map((o) => o.label)).toEqual(["Cut 25", "Hold"]);
    expect(grid[0].total).toBeCloseTo(1.0, 5);
  });

  it("skips meetings with a single priced outcome", () => {
    const grid = fedMeetingGrid(
      [mk("Will the Fed Cut rates by 25bps at their September 2026 meeting?", 0.5, "2026-09")],
      "2026-01",
    );
    expect(grid).toHaveLength(0);
  });
});

describe("displayTitle", () => {
  it("cleans a Fed hold decision title", () => {
    expect(
      displayTitle(m({ title: "Will the Federal Reserve Hike rates by 0bps at their September 2026 meeting?", endDate: "2026-09-16" })),
    ).toBe("Fed holds at the Sep 2026 meeting");
  });

  it("cleans a Fed cut decision title", () => {
    expect(
      displayTitle(m({ title: "Will the Federal Reserve Cut rates by 25bps at their September 2026 meeting?", endDate: "2026-09-16" })),
    ).toBe("Fed cuts 25bps at the Sep 2026 meeting");
  });

  it("cleans the verbose rate-level 'upper bound above X%' family using the resolution month", () => {
    expect(
      displayTitle(m({ title: "Will the upper bound of the federal funds rate be above 3.75% following the Fed's Sep 16, 2026 meeting?", endDate: "2026-09-16" })),
    ).toBe("Fed funds >3.75% after the Sep 2026 meeting");
  });

  it("handles the 'below' direction", () => {
    expect(
      displayTitle(m({ title: "Will the upper bound of the federal funds rate be below 3.00% following the Fed's Dec 2026 meeting?", endDate: "2026-12-16" })),
    ).toBe("Fed funds <3.00% after the Dec 2026 meeting");
  });

  it("cleans open-ended '50+ bps' magnitude markets", () => {
    expect(
      displayTitle(m({ title: "Will the Fed increase interest rates by 50+ bps after the July 2026 meeting?", endDate: "2026-07-29" })),
    ).toBe("Fed hikes 50+bps after the Jul 2026 meeting");
    expect(
      displayTitle(m({ title: "Will the Fed decrease interest rates by 50+ bps after the July 2026 meeting?", endDate: "2026-07-29" })),
    ).toBe("Fed cuts 50+bps after the Jul 2026 meeting");
  });

  it("leaves multi-meeting combo markets as their descriptive title", () => {
    const title = "Will the Fed Pause-Pause-Pause in the next three decisions (Apr-Jun-Jul)?";
    expect(displayTitle(m({ title }))).toBe(title);
  });

  it("cleans per-meeting markets that lack an endDate, reading the month from the title", () => {
    expect(
      displayTitle(m({ title: "Will the Fed decrease interest rates by 25 bps after the September 2026 meeting?", endDate: "" })),
    ).toBe("Fed cuts 25bps at the Sep 2026 meeting");
    expect(
      displayTitle(m({ title: "Will there be no change in Fed interest rates after the July 2026 meeting?", endDate: "" })),
    ).toBe("Fed holds at the Jul 2026 meeting");
  });

  it("cleans the count-of-cuts family", () => {
    expect(displayTitle(m({ title: "Will 3 Fed rate cuts happen in 2026?" }))).toBe("3 Fed rate cuts in 2026");
    expect(displayTitle(m({ title: "Will 1 Fed rate cut happen in 2026?" }))).toBe("1 Fed rate cut in 2026");
    expect(displayTitle(m({ title: "Will no Fed rate cuts happen in 2026?" }))).toBe("No Fed rate cuts in 2026");
    expect(displayTitle(m({ title: "Will 12 or more Fed rate cuts happen in 2026?" }))).toBe("12+ Fed rate cuts in 2026");
  });

  it("cleans the 'before YYYY' horizon families", () => {
    expect(displayTitle(m({ title: "Will the Fed's lower bound reach 2.75% or lower before 2027?" }))).toBe("Fed lower bound ≤2.75% before 2027");
    expect(displayTitle(m({ title: "Will the Fed's upper bound reach 5.25% or higher before 2027?" }))).toBe("Fed upper bound ≥5.25% before 2027");
    expect(displayTitle(m({ title: "Will the Federal Reserve cut rates before 2027?" }))).toBe("Fed cuts rates before 2027");
    expect(displayTitle(m({ title: "Will the Federal Reserve raise the target range for the federal funds rate before 2027?" }))).toBe("Fed raises rates before 2027");
  });

  it("does not touch ECB / BoJ markets in the Rates/Fed theme", () => {
    const title = "No change in Bank of Japan's interest rates after the July 2026 meeting?";
    expect(displayTitle(m({ title }))).toBe(title);
  });

  it("passes a non-Fed title through unchanged", () => {
    const title = "US recession called in 2026";
    expect(displayTitle(m({ category: "Growth/Recession", title }))).toBe(title);
  });
});
