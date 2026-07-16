import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/kvClient", () => ({
  boardStore: {
    readBoard: async () => ({ markets: [{ id: "a", platform: "Kalshi", title: "t", category: "Rates/Fed", prob: 0.5, volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "" }], moves: { a: 0.1 }, fetchedAt: "2026-07-15T10:00:00" }),
  },
}));

import { GET } from "./route";

describe("GET /api/board", () => {
  it("returns the cached board payload", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.markets.length).toBe(1);
    expect(body.moves.a).toBeCloseTo(0.1);
  });
});
