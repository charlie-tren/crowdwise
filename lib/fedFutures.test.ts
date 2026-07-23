import { describe, it, expect } from "vitest";
import {
  excelSerialToMs, parseTargetMidPct, buildFedFuturesPath, buildOverlaySeries,
  type MptRow,
} from "./fedFutures";
import type { FedPathPoint } from "./highlights";

describe("excelSerialToMs", () => {
  it("converts the Unix epoch serial", () => {
    expect(excelSerialToMs(25569)).toBe(0); // 1970-01-01
  });
  it("converts a known serial to the right date", () => {
    // 45098 -> 2023-06-21
    expect(new Date(excelSerialToMs(45098)).toISOString().slice(0, 10)).toBe("2023-06-21");
  });
  it("NaN on junk", () => expect(Number.isNaN(excelSerialToMs("x"))).toBe(true));
});

describe("parseTargetMidPct", () => {
  it("averages a bps range to a percent midpoint", () => {
    expect(parseTargetMidPct("425bps - 450bps")).toBeCloseTo(4.375);
    expect(parseTargetMidPct("350bps - 375bps")).toBeCloseTo(3.625);
  });
  it("NaN when no bps figure", () => expect(Number.isNaN(parseTargetMidPct("n/a"))).toBe(true));
});

const row = (over: Partial<MptRow> = {}): MptRow => ({
  date: "2026-07-21", referenceStart: "46000", targetRange: "350bps - 375bps",
  field: "Rate: mean", value: 392, ...over,
});

describe("buildFedFuturesPath", () => {
  it("builds a path for the latest date only, bps -> percent", () => {
    const rows: MptRow[] = [
      // older date - must be ignored
      row({ date: "2026-07-14", referenceStart: "46000", field: "Rate: mean", value: 500 }),
      // latest date, window A
      row({ referenceStart: "46000", field: "Rate: mean", value: 392 }),
      row({ referenceStart: "46000", field: "Rate: 25th percentile", value: 377 }),
      row({ referenceStart: "46000", field: "Rate: 75th percentile", value: 406 }),
      // latest date, window B (later)
      row({ referenceStart: "46090", field: "Rate: mean", value: 408 }),
      row({ referenceStart: "46090", field: "Rate: 25th percentile", value: 377 }),
      row({ referenceStart: "46090", field: "Rate: 75th percentile", value: 438 }),
    ];
    const path = buildFedFuturesPath(rows);
    expect(path).not.toBeNull();
    expect(path!.asOf).toBe("2026-07-21");
    expect(path!.currentRatePct).toBeCloseTo(3.625);
    expect(path!.points).toHaveLength(2);
    expect(path!.points[0].meanPct).toBeCloseTo(3.92);
    expect(path!.points[0].p25Pct).toBeCloseTo(3.77);
    expect(path!.points[0].p75Pct).toBeCloseTo(4.06);
    // sorted by window start ascending
    expect(path!.points[0].refStartTs).toBeLessThan(path!.points[1].refStartTs);
  });

  it("drops a window missing a percentile (incomplete)", () => {
    const rows: MptRow[] = [
      row({ referenceStart: "46000", field: "Rate: mean", value: 392 }),
      row({ referenceStart: "46000", field: "Rate: 25th percentile", value: 377 }),
      // no 75th for 46000 -> dropped
      row({ referenceStart: "46090", field: "Rate: mean", value: 408 }),
      row({ referenceStart: "46090", field: "Rate: 25th percentile", value: 377 }),
      row({ referenceStart: "46090", field: "Rate: 75th percentile", value: 438 }),
    ];
    // only 1 complete window -> < 2 points -> null
    expect(buildFedFuturesPath(rows)).toBeNull();
  });

  it("returns null on empty input", () => expect(buildFedFuturesPath([])).toBeNull());
});

describe("buildOverlaySeries", () => {
  const now = Date.UTC(2026, 6, 23); // 2026-07-23
  const futures = {
    asOf: "2026-07-21",
    currentRatePct: 3.625,
    points: [
      { refStartTs: Date.UTC(2026, 8, 16), meanPct: 3.92, p25Pct: 3.77, p75Pct: 4.06 }, // Sep 2026
      { refStartTs: Date.UTC(2027, 5, 16), meanPct: 4.17, p25Pct: 3.7, p75Pct: 4.6 },   // Jun 2027 (in horizon)
      { refStartTs: Date.UTC(2028, 5, 16), meanPct: 4.02, p25Pct: 2.8, p75Pct: 5.4 },   // Jun 2028 (BEYOND 18m)
    ],
  };
  const crowd: FedPathPoint[] = [
    { ym: "2026-09", label: "Sep 2026", expectedBps: -10, cumulativeBps: -10 },
    { ym: "2026-12", label: "Dec 2026", expectedBps: -15, cumulativeBps: -25 },
  ];

  it("anchors both series at the current rate at Now", () => {
    const rows = buildOverlaySeries(futures, crowd, now);
    const nowRow = rows.find((r) => r.label === "Now")!;
    expect(nowRow.futMean).toBeCloseTo(3.625);
    expect(nowRow.crowd).toBeCloseTo(3.625);
    expect(nowRow.band).toEqual([3.625, 3.625]);
  });

  it("expresses the crowd path as current rate + cumulative change (level, percent)", () => {
    const rows = buildOverlaySeries(futures, crowd, now);
    const dec = rows.find((r) => r.crowd != null && r.label === "Dec 26")!;
    expect(dec.crowd).toBeCloseTo(3.625 - 0.25); // -25bps -> 3.375
  });

  it("caps futures points beyond the horizon", () => {
    const rows = buildOverlaySeries(futures, crowd, now, 18);
    // Sep 2026 + Jun 2027 kept; Jun 2028 dropped
    const futTs = rows.filter((r) => r.futMean != null && r.label !== "Now").map((r) => r.ts);
    expect(futTs).toContain(Date.UTC(2026, 8, 16));
    expect(futTs).toContain(Date.UTC(2027, 5, 16));
    expect(futTs).not.toContain(Date.UTC(2028, 5, 16));
  });

  it("returns rows sorted by timestamp", () => {
    const rows = buildOverlaySeries(futures, crowd, now);
    const ts = rows.map((r) => r.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });
});
