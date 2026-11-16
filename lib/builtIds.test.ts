import { describe, it, expect } from "vitest";
import { MAX_RETAINED, parseSeen, retainedIds } from "./builtIds";

const NOW = Date.parse("2026-11-16T00:00:00Z");

describe("parseSeen", () => {
  it("keeps id -> ISO pairs and drops junk", () => {
    expect(parseSeen({ a: "2026-11-01T00:00:00Z", b: 3, c: "not a date", "": "2026-11-01" })).toEqual({
      a: "2026-11-01T00:00:00Z",
    });
    expect(parseSeen(null)).toEqual({});
    expect(parseSeen(["a"])).toEqual({});
  });
});

describe("retainedIds", () => {
  it("keeps off-board ids seen within 30 days", () => {
    const prev = {
      onboard: "2026-11-15T00:00:00Z",
      recent: "2026-11-01T00:00:00Z",
      stale: "2026-10-01T00:00:00Z",
    };
    expect(retainedIds(["onboard"], prev, NOW)).toEqual(["recent"]);
  });

  it("caps the list, keeping the most recently seen", () => {
    const prev: Record<string, string> = {};
    for (let i = 0; i < MAX_RETAINED + 5; i++) prev["m" + i] = new Date(NOW - i * 60_000).toISOString();
    const kept = retainedIds([], prev, NOW);
    expect(kept).toHaveLength(MAX_RETAINED);
    expect(kept[0]).toBe("m0");
    expect(kept).not.toContain("m" + MAX_RETAINED);
  });
});
