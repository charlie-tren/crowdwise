import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/buildBoard", () => ({
  getBuildBoard: async () => ({
    markets: [{ id: "a", platform: "Kalshi", title: "t", category: "Rates/Fed", prob: 0.5, volume: 1, endDate: "2026-12-31", status: "active", series: "KX", event: "" }],
    extra: [],
    seen: { a: "2026-07-15T10:00:00Z" },
    builtAt: "2026-07-15T10:00:00Z",
  }),
}));

import { GET } from "./route";

describe("GET /api/board", () => {
  it("returns the build's board", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.markets.length).toBe(1);
    expect(body.fetchedAt).toBe("2026-07-15T10:00:00Z");
  });
});
