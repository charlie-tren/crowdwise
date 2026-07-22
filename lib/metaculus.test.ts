import { describe, it, expect, afterEach } from "vitest";
import {
  normaliseMetaculusPost,
  fetchMetaculusForecasts,
  matchMetaculusToMarkets,
  setHttpGetJson,
  resetHttpGetJson,
  type MetaculusForecast,
} from "./metaculus";
import type { Market } from "./types";

afterEach(() => resetHttpGetJson());

// A realistic /api/posts/ payload item: a binary question with the current
// recency-weighted aggregation shape.
const post = (overrides: Record<string, any> = {}) => ({
  id: 12345,
  title: "Will the US enter a recession in 2026?",
  scheduled_close_time: "2026-12-31T00:00:00Z",
  question: {
    id: 12345,
    type: "binary",
    scheduled_close_time: "2026-12-31T00:00:00Z",
    aggregations: {
      recency_weighted: {
        latest: { centers: [0.28], forecaster_count: 142 },
      },
    },
  },
  ...overrides,
});

describe("normaliseMetaculusPost", () => {
  it("normalises a binary question with the recency-weighted aggregation", () => {
    const f = normaliseMetaculusPost(post());
    expect(f).not.toBeNull();
    expect(f!.id).toBe(12345);
    expect(f!.prob).toBeCloseTo(0.28);
    expect(f!.forecasterCount).toBe(142);
    expect(f!.category).toBe("Growth/Recession");
    expect(f!.closeDate).toBe("2026-12-31T00:00:00Z");
    expect(f!.url).toBe("https://www.metaculus.com/questions/12345/");
  });

  it("reads the older community_prediction.full.q2 median shape", () => {
    const f = normaliseMetaculusPost(
      post({ question: { id: 1, type: "binary", community_prediction: { full: { q2: 0.61 } } } }),
    );
    expect(f!.prob).toBeCloseTo(0.61);
  });

  it("skips non-binary questions (numeric/date/multiple choice)", () => {
    expect(normaliseMetaculusPost(post({ question: { type: "numeric", aggregations: {} } }))).toBeNull();
  });

  it("skips a binary question with no usable community prediction", () => {
    expect(
      normaliseMetaculusPost(post({ question: { type: "binary", aggregations: { recency_weighted: { latest: {} } } } })),
    ).toBeNull();
  });

  it("skips a prob outside [0,1]", () => {
    expect(
      normaliseMetaculusPost(
        post({ question: { type: "binary", aggregations: { recency_weighted: { latest: { centers: [1.4] } } } } }),
      ),
    ).toBeNull();
  });

  it("defaults forecaster count to 0 when absent", () => {
    const f = normaliseMetaculusPost(
      post({ question: { id: 9, type: "binary", aggregations: { recency_weighted: { latest: { centers: [0.5] } } } } }),
    );
    expect(f!.forecasterCount).toBe(0);
  });
});

describe("fetchMetaculusForecasts (mocked seam)", () => {
  it("returns [] with no token (graceful degrade, no fetch)", async () => {
    let called = false;
    setHttpGetJson(async () => { called = true; return {}; });
    const out = await fetchMetaculusForecasts(undefined, ["recession"]);
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("passes the token to the http layer and normalises results", async () => {
    let seenToken: string | undefined;
    setHttpGetJson(async (_url, _params, token) => {
      seenToken = token;
      return { results: [post()] };
    });
    const out = await fetchMetaculusForecasts("tok_abc", ["recession"]);
    expect(seenToken).toBe("tok_abc");
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("Growth/Recession");
  });

  it("dedupes by id across terms and drops non-macro (Other) questions", async () => {
    setHttpGetJson(async (_url, params) => {
      if (params?.search === "recession") return { results: [post()] };
      // same recession post again (dupe) + an off-topic sports question
      return {
        results: [
          post(),
          post({ id: 999, title: "Will the Lakers win the 2026 title?", question: { id: 999, type: "binary", aggregations: { recency_weighted: { latest: { centers: [0.4] } } } } }),
        ],
      };
    });
    const out = await fetchMetaculusForecasts("tok", ["recession", "GDP"]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(12345);
  });

  it("one failing term is not fatal", async () => {
    setHttpGetJson(async (_url, params) => {
      if (params?.search === "boom") throw new Error("boom");
      return { results: [post()] };
    });
    const out = await fetchMetaculusForecasts("tok", ["boom", "recession"]);
    expect(out).toHaveLength(1);
  });
});

describe("matchMetaculusToMarkets", () => {
  let seq = 0;
  const mkt = (overrides: Partial<Market> = {}): Market => {
    seq += 1;
    return {
      id: `id-${seq}`, platform: "Kalshi", title: "Untitled", category: "Rates/Fed",
      prob: 0.5, volume: 1000, endDate: "", status: "active", series: "KX", event: "", ...overrides,
    };
  };
  const fc = (overrides: Partial<MetaculusForecast> = {}): MetaculusForecast => ({
    id: 1, title: "Untitled", category: "Growth/Recession", prob: 0.3,
    forecasterCount: 100, closeDate: "2026-12-31", url: "u", ...overrides,
  });

  it("pairs a recession market with the same-year Metaculus forecast", () => {
    const market = mkt({
      category: "Growth/Recession", title: "Will the US be in a recession in 2026?",
      endDate: "2026-12-31", prob: 0.42,
    });
    const forecast = fc({ title: "Will the US enter a recession in 2026?", prob: 0.28 });
    const out = matchMetaculusToMarkets([market], [forecast]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("recession");
    expect(out[0].label).toBe("US recession in 2026");
    expect(out[0].marketProb).toBeCloseTo(0.42);
    expect(out[0].metaculusProb).toBeCloseTo(0.28);
    expect(out[0].divergence).toBeCloseTo(0.14, 5);
  });

  it("does not pair different-year recession propositions", () => {
    const market = mkt({ category: "Growth/Recession", title: "US recession in 2027?", prob: 0.2 });
    const forecast = fc({ title: "Will the US enter a recession in 2026?", prob: 0.28 });
    expect(matchMetaculusToMarkets([market], [forecast])).toHaveLength(0);
  });

  it("does not pair a US recession forecast with a Japan recession market", () => {
    const market = mkt({ category: "Growth/Recession", title: "Japan recession in 2026?", prob: 0.1 });
    const forecast = fc({ title: "Will the US enter a recession in 2026?", prob: 0.28 });
    expect(matchMetaculusToMarkets([market], [forecast])).toHaveLength(0);
  });

  it("sorts multiple matches by divergence desc", () => {
    const recMkt = mkt({ category: "Growth/Recession", title: "US recession in 2026?", prob: 0.5 });
    const recFc = fc({ id: 1, title: "US recession in 2026?", prob: 0.2 }); // gap 0.30
    const fedMkt = mkt({
      category: "Rates/Fed",
      title: "Will the Federal Reserve Cut rates by 25bps at their September 2026 meeting?",
      endDate: "2026-09-16", prob: 0.4,
    });
    const fedFc = fc({
      id: 2, category: "Rates/Fed",
      title: "Will the Fed cut rates by 25bps at the September 2026 meeting?",
      closeDate: "2026-09-16", prob: 0.35, // gap 0.05
    });
    const out = matchMetaculusToMarkets([recMkt, fedMkt], [recFc, fedFc]);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].key).toContain("recession");
    if (out.length > 1) expect(out[0].divergence).toBeGreaterThan(out[1].divergence);
  });
});
