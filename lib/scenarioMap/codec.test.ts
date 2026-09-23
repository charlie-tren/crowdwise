import { describe, it, expect, beforeEach } from "vitest";
import { encodeMap, decodeMap, loadSaved, saveMap, deleteMap, STORAGE_KEY } from "./codec";
import type { ScenarioMap } from "./types";

const full: ScenarioMap = {
  id: "mine", name: "My map",
  nodes: [
    { id: "m1", kind: "market", label: "Fed cuts", marketId: "KX-1", side: "no" },
    { id: "i1", kind: "input", label: "My read", low: 0.2, likely: 0.35, high: 0.6, source: "Charlie" },
    { id: "f1", kind: "formula", label: "Both", op: "and", refs: ["m1", "i1"] },
    { id: "f2", kind: "formula", label: "Blend", op: "mix", refs: ["m1", "i1"], weights: [2, 1] },
    { id: "f3", kind: "formula", label: "Given", op: "depends", refs: ["m1", "i1", "f1"] },
  ],
};

const fiveOps: ScenarioMap = {
  id: "five", name: "Five ops",
  nodes: [
    { id: "m1", kind: "market", label: "Fed cuts", marketId: "KX-1", side: "no" },
    { id: "i1", kind: "input", label: "My read", low: 0.2, likely: 0.35, high: 0.6, source: "Charlie" },
    { id: "a", kind: "formula", label: "And", op: "and", refs: ["m1", "i1"] },
    { id: "o", kind: "formula", label: "Or", op: "or", refs: ["m1", "i1"] },
    { id: "n", kind: "formula", label: "Not", op: "not", refs: ["m1"] },
    { id: "x", kind: "formula", label: "Mix", op: "mix", refs: ["m1", "i1"], weights: [2, 1] },
    { id: "d", kind: "formula", label: "Depends", op: "depends", refs: ["m1", "i1", "a"] },
  ],
};

describe("encodeMap / decodeMap", () => {
  it("round-trips every node kind", () => {
    expect(decodeMap(encodeMap(full))).toEqual(full);
  });

  it("round-trips a genuine map that uses all five operators, unchanged, once op is validated", () => {
    // Pinned so the new op-whitelist in isNode cannot be tightened into
    // rejecting a real map: every legitimate operator must still survive
    // the trip it always has.
    expect(decodeMap(encodeMap(fiveOps))).toEqual(fiveOps);
  });

  it("rejects a formula node whose op names an inherited Object.prototype member", () => {
    // The same crafted-link attack the engine has to survive on its own (see
    // engine.test.ts): here it should never even reach the engine, because
    // decodeMap is the trust boundary and an op outside the five real
    // operators is malformed input, same as a missing field.
    const bad = {
      id: "x", name: "x",
      nodes: [
        { id: "a", kind: "market", label: "A", marketId: "ma", side: "yes" },
        { id: "f", kind: "formula", label: "F", op: "hasOwnProperty", refs: ["a"] },
      ],
    };
    expect(decodeMap(encodeMap(bad as unknown as ScenarioMap))).toBeNull();
  });

  it("rejects a payload with an absurd node count rather than admitting it for the engine to deal with", () => {
    const huge: ScenarioMap = {
      id: "huge", name: "huge",
      nodes: Array.from({ length: 50_000 }, (_, i) => ({
        id: `n${i}`, kind: "input" as const, label: "x",
        low: 0, likely: 0, high: 0, source: "",
      })),
    };
    expect(decodeMap(encodeMap(huge))).toBeNull();
  });

  it("emits a URL-safe string with no padding", () => {
    expect(encodeMap(full)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns null for rubbish rather than throwing", () => {
    expect(decodeMap("not-a-real-hash")).toBeNull();
    expect(decodeMap("")).toBeNull();
  });

  it("returns null when the payload decodes but is not a map", () => {
    expect(decodeMap(encodeMap({ id: "x", name: "x", nodes: [] } as ScenarioMap))).not.toBeNull();
    expect(decodeMap(btoa('{"nope":1}').replace(/=+$/, ""))).toBeNull();
  });

  it("drops the builtIn flag, because a shared copy is the reader's own", () => {
    const shared = decodeMap(encodeMap({ ...full, builtIn: true }))!;
    expect(shared.builtIn).toBeUndefined();
  });

  it("rejects a mix node with a non-numeric weight, because loose comparison would let it through as a silent 0", () => {
    const bad = {
      id: "x", name: "x",
      nodes: [
        { id: "a", kind: "market", label: "A", marketId: "ma", side: "yes" },
        { id: "b", kind: "market", label: "B", marketId: "mb", side: "yes" },
        { id: "f", kind: "formula", label: "Mix", op: "mix", refs: ["a", "b"], weights: ["oops", 1] },
      ],
    };
    expect(decodeMap(encodeMap(bad as unknown as ScenarioMap))).toBeNull();
  });

  it("rejects a mix node whose weights is a string, not an array, even when its length happens to match refs", () => {
    // Without an Array.isArray guard this would reach REF_RULES.mix in engine.ts,
    // whose `weights.some(...)` throws on a string (strings have no .some), so
    // the hole here is a crash, not just a wrong figure.
    const bad = {
      id: "x", name: "x",
      nodes: [
        { id: "a", kind: "market", label: "A", marketId: "ma", side: "yes" },
        { id: "b", kind: "market", label: "B", marketId: "mb", side: "yes" },
        { id: "f", kind: "formula", label: "Mix", op: "mix", refs: ["a", "b"], weights: "ab" },
      ],
    };
    expect(decodeMap(encodeMap(bad as unknown as ScenarioMap))).toBeNull();
  });

  it("round-trips a market node's override", () => {
    const withOverride: ScenarioMap = {
      id: "ov", name: "Override",
      nodes: [{ id: "m1", kind: "market", label: "Fed cuts", marketId: "KX-1", side: "no", override: 0.42 }],
    };
    expect(decodeMap(encodeMap(withOverride))).toEqual(withOverride);
  });

  it("round-trips a market node with no override at all, unchanged", () => {
    const noOverride: ScenarioMap = {
      id: "no-ov", name: "No override",
      nodes: [{ id: "m1", kind: "market", label: "Fed cuts", marketId: "KX-1", side: "no" }],
    };
    expect(decodeMap(encodeMap(noOverride))).toEqual(noOverride);
  });

  it("rejects an override outside 0 to 1, same as any other untrusted number reaching this boundary", () => {
    const bad = {
      id: "x", name: "x",
      nodes: [{ id: "a", kind: "market", label: "A", marketId: "ma", side: "yes", override: 1.4 }],
    };
    expect(decodeMap(encodeMap(bad as unknown as ScenarioMap))).toBeNull();
  });

  it("rejects a non-numeric override", () => {
    const bad = {
      id: "x", name: "x",
      nodes: [{ id: "a", kind: "market", label: "A", marketId: "ma", side: "yes", override: "90%" }],
    };
    expect(decodeMap(encodeMap(bad as unknown as ScenarioMap))).toBeNull();
  });

  it("rejects a negative override", () => {
    const bad = {
      id: "x", name: "x",
      nodes: [{ id: "a", kind: "market", label: "A", marketId: "ma", side: "yes", override: -0.1 }],
    };
    expect(decodeMap(encodeMap(bad as unknown as ScenarioMap))).toBeNull();
  });
});

describe("localStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts empty", () => expect(loadSaved()).toEqual([]));

  it("saves and reads back", () => {
    saveMap(full);
    expect(loadSaved()).toEqual([full]);
  });

  it("replaces a map with the same id rather than duplicating it", () => {
    saveMap(full);
    saveMap({ ...full, name: "Renamed" });
    const all = loadSaved();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Renamed");
  });

  it("deletes by id", () => {
    saveMap(full);
    deleteMap(full.id);
    expect(loadSaved()).toEqual([]);
  });

  it("returns an empty list when the stored value is corrupt", () => {
    window.localStorage.setItem(STORAGE_KEY, "{{{");
    expect(loadSaved()).toEqual([]);
  });
});
