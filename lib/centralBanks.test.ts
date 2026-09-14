import { describe, it, expect } from "vitest";
import { centralBankRows, disagreements, fedBpsPricedBy, CB_SERIES } from "./centralBanks";
import { parseAsxFutures, bpsPricedBy } from "./asxFutures";
import type { Market } from "./types";

let seq = 0;
const m = (overrides: Partial<Market> = {}): Market => {
  seq += 1;
  return {
    id: `id-${seq}`, platform: "Kalshi", title: "Untitled", category: "Rates/Fed",
    prob: 0.5, volume: 1000, endDate: "2027-01-01", status: "active",
    series: CB_SERIES, event: "", ...overrides,
  };
};

describe("centralBankRows", () => {
  it("keeps only the central-bank series and names each bank", () => {
    const rows = centralBankRows([
      m({ id: "KXCBRATEHIKE-27-RBA", prob: 0.65 }),
      m({ id: "KXCBRATEHIKE-27-FED", prob: 0.86 }),
      m({ id: "KXFED-26SEP-H25", prob: 0.78, series: "KXFED" }), // different series
    ]);
    expect(rows.map((r) => r.code)).toEqual(["FED", "RBA"]); // sorted by probability
    expect(rows[1].bank).toBe("Reserve Bank of Australia");
  });

  it("drops an unknown bank rather than labelling it wrongly", () => {
    // An eighth bank added upstream should show as a gap we notice, not as a row
    // carrying a ticker suffix where a name belongs.
    const rows = centralBankRows([m({ id: "KXCBRATEHIKE-27-ECB", prob: 0.4 })]);
    expect(rows).toEqual([]);
  });

  it("drops a market with no price", () => {
    expect(centralBankRows([m({ id: "KXCBRATEHIKE-27-RBA", prob: null })])).toEqual([]);
  });

  it("attaches a futures comparator only where one was supplied", () => {
    const rows = centralBankRows(
      [m({ id: "KXCBRATEHIKE-27-RBA", prob: 0.65 }),
       m({ id: "KXCBRATEHIKE-27-SNB", prob: 0.1 })],
      { bps: { RBA: 35 }, source: { RBA: "ASX 30-day interbank futures" } },
    );
    const rba = rows.find((r) => r.code === "RBA")!;
    const snb = rows.find((r) => r.code === "SNB")!;
    expect(rba.futuresBps).toBe(35);
    expect(snb.futuresBps).toBeNull();
    expect(snb.futuresSource).toBeNull();
  });
});

describe("disagreements", () => {
  const row = (over: Partial<ReturnType<typeof centralBankRows>[0]>) => ({
    code: "X", bank: "X", prob: 0.5, volume: 1, futuresBps: null,
    futuresSource: null, ...over,
  });

  it("flags a full hike priced against a hesitant crowd", () => {
    // The live case on 14/09/2026: ASX priced +35bp while Kalshi sat at 65%.
    expect(disagreements([row({ futuresBps: 35, prob: 0.65 })])).toHaveLength(1);
  });

  it("flags nothing priced against a confident crowd", () => {
    expect(disagreements([row({ futuresBps: 0, prob: 0.6 })])).toHaveLength(1);
  });

  it("stays quiet when the two agree", () => {
    expect(disagreements([row({ futuresBps: 35, prob: 0.92 })])).toHaveLength(0);
    expect(disagreements([row({ futuresBps: 0, prob: 0.05 })])).toHaveLength(0);
  });

  it("never flags a row with no comparator", () => {
    // Silence must mean agreement, not absence. A crowd-only row flagged as a
    // disagreement would invent a real-money view that was never measured.
    expect(disagreements([row({ futuresBps: null, prob: 0.99 })])).toHaveLength(0);
  });
});

describe("parseAsxFutures", () => {
  const item = (expiry: string, bid: number, ask: number) => ({
    dateExpiry: expiry, priceBid: bid, priceAsk: ask,
  });

  it("reads the implied cash rate as 100 minus the price", () => {
    // The real front contract on 14/09/2026: 95.64/95.645 -> 4.358%, against an
    // RBA cash rate of 4.35%. That tie-out is what proves the sign convention.
    const p = parseAsxFutures({ data: { items: [
      item("2026-09-28", 95.64, 95.645),
      item("2026-12-29", 95.28, 95.30),
    ] } })!;
    expect(p.currentPct).toBeCloseTo(4.3575, 3);
    expect(p.contracts).toHaveLength(2);
  });

  it("sorts by expiry, so the front contract is the current read", () => {
    const p = parseAsxFutures({ data: { items: [
      item("2027-03-29", 95.14, 95.16),
      item("2026-09-28", 95.64, 95.645),
    ] } })!;
    expect(p.contracts[0].expiry).toBe("2026-09-28");
    expect(p.currentPct).toBeCloseTo(4.3575, 3);
  });

  it("refuses a price that implies an impossible rate", () => {
    // A parse fault must not publish a rate. 120 would imply -20%.
    const p = parseAsxFutures({ data: { items: [
      item("2026-09-28", 120, 120), item("2026-10-28", 95.46, 95.46),
      item("2026-12-29", 95.28, 95.30),
    ] } })!;
    expect(p.contracts.map((c) => c.expiry)).toEqual(["2026-10-28", "2026-12-29"]);
  });

  it("returns null rather than a one-contract path", () => {
    expect(parseAsxFutures({ data: { items: [item("2026-09-28", 95.64, 95.645)] } })).toBeNull();
    expect(parseAsxFutures({})).toBeNull();
    expect(parseAsxFutures({ data: { items: [] } })).toBeNull();
  });

  it("falls back to the previous settlement when a contract quotes one side", () => {
    const p = parseAsxFutures({ data: { items: [
      item("2026-09-28", 95.64, 95.645),
      { dateExpiry: "2027-06-29", priceBid: 95.0, pricePreviousSettlement: 94.9 },
    ] } })!;
    expect(p.contracts[1].impliedPct).toBeCloseTo(5.1, 3);
  });
});

describe("bpsPricedBy", () => {
  const path = parseAsxFutures({ data: { items: [
    { dateExpiry: "2026-09-28", priceBid: 95.64, priceAsk: 95.645 },
    { dateExpiry: "2026-12-29", priceBid: 95.28, priceAsk: 95.30 },
    { dateExpiry: "2027-06-29", priceBid: 95.00, priceAsk: 95.02 },
  ] } })!;

  it("measures from the front contract to the last one that reaches the date", () => {
    // 4.71 - 4.3575 = 35bp, the live figure on 14/09/2026.
    expect(bpsPricedBy(path, "2026-12-31")).toBe(35);
  });

  it("does not extrapolate past the curve", () => {
    expect(bpsPricedBy(path, "2020-01-01")).toBeNull();
  });

  it("can come out negative when cuts are priced", () => {
    // The check has to be able to report easing, or it is only ever an argument
    // for hikes.
    const easing = parseAsxFutures({ data: { items: [
      { dateExpiry: "2026-09-28", priceBid: 95.64, priceAsk: 95.645 },
      { dateExpiry: "2026-12-29", priceBid: 96.14, priceAsk: 96.145 },
    ] } })!;
    expect(bpsPricedBy(easing, "2026-12-31")).toBe(-50);
  });
});

describe("fedBpsPricedBy", () => {
  const ts = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const path = {
    currentRatePct: 4.375,
    points: [
      { refStartTs: ts("2026-10-01"), meanPct: 4.55 },
      { refStartTs: ts("2026-12-01"), meanPct: 4.70 },
      { refStartTs: ts("2027-06-01"), meanPct: 4.90 },
    ],
  };

  it("measures to the last window inside the date, not past it", () => {
    expect(fedBpsPricedBy(path, "2026-12-31")).toBe(33); // 4.70 - 4.375
  });

  it("does not extrapolate when nothing reaches that far", () => {
    expect(fedBpsPricedBy(path, "2020-01-01")).toBeNull();
  });

  it("reports easing as negative", () => {
    const easing = { currentRatePct: 4.375, points: [{ refStartTs: ts("2026-12-01"), meanPct: 3.875 }] };
    expect(fedBpsPricedBy(easing, "2026-12-31")).toBe(-50);
  });
});
