import { describe, it, expect } from "vitest";
import { layoutMap, NODE_W, NODE_H } from "./layout";
import type { ScenarioMap } from "./types";

const input = (id: string) =>
  ({ id, kind: "input", label: id, low: 0.5, likely: 0.5, high: 0.5, source: "x" }) as const;

const diamond: ScenarioMap = {
  id: "d", name: "d",
  nodes: [
    input("a"),
    { id: "l", kind: "formula", label: "L", op: "not", refs: ["a"] },
    { id: "r", kind: "formula", label: "R", op: "not", refs: ["a"] },
    { id: "top", kind: "formula", label: "T", op: "and", refs: ["l", "r"] },
  ],
};

describe("layoutMap", () => {
  it("puts a leaf in layer 0 and each formula one layer past its deepest input", () => {
    const l = layoutMap(diamond, 900);
    const layer = (id: string) => l.nodes.find((n) => n.id === id)!.layer;
    expect(layer("a")).toBe(0);
    expect(layer("l")).toBe(1);
    expect(layer("r")).toBe(1);
    expect(layer("top")).toBe(2);
  });

  it("places a node to the right of every node it reads", () => {
    const l = layoutMap(diamond, 900);
    const x = (id: string) => l.nodes.find((n) => n.id === id)!.x;
    expect(x("top")).toBeGreaterThan(x("l"));
    expect(x("l")).toBeGreaterThan(x("a"));
  });

  it("separates nodes sharing a layer by at least the node height", () => {
    const l = layoutMap(diamond, 900);
    const ys = l.nodes.filter((n) => n.layer === 1).map((n) => n.y).sort((p, q) => p - q);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(NODE_H);
  });

  it("emits one edge per ref, pointing from the input to the reader", () => {
    const l = layoutMap(diamond, 900);
    expect(l.edges).toHaveLength(4); // a->l, a->r, l->top, r->top
    expect(l.edges.every((e) => e.path.startsWith("M"))).toBe(true);
    expect(l.edges.some((e) => e.from === "a" && e.to === "l")).toBe(true);
  });

  it("is deterministic and independent of node order in the array", () => {
    const shuffled: ScenarioMap = { ...diamond, nodes: [...diamond.nodes].reverse() };
    const a = layoutMap(diamond, 900);
    const b = layoutMap(shuffled, 900);
    // Node set: order-independent by construction (sorted by id, then by
    // barycentre), so comparing as sets is enough.
    const aNodes = a.nodes.map((n) => `${n.id}:${n.layer}`).sort();
    const bNodes = b.nodes.map((n) => `${n.id}:${n.layer}`).sort();
    expect(aNodes).toEqual(bNodes);
    // Edge array: must match position for position, not just as a set, so the
    // same graph in a different node order draws identically.
    const aEdges = a.edges.map((e) => `${e.from}->${e.to}`);
    const bEdges = b.edges.map((e) => `${e.from}->${e.to}`);
    expect(aEdges).toEqual(bEdges);
  });

  it("keeps every node inside the reported canvas", () => {
    const l = layoutMap(diamond, 900);
    for (const n of l.nodes) {
      expect(n.x - NODE_W / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + NODE_W / 2).toBeLessThanOrEqual(l.width);
      expect(n.y - NODE_H / 2).toBeGreaterThanOrEqual(0);
      expect(n.y + NODE_H / 2).toBeLessThanOrEqual(l.height);
    }
  });

  it("drops a ref that names nothing rather than drawing an edge to nowhere", () => {
    const broken: ScenarioMap = {
      id: "b", name: "b",
      nodes: [input("a"), { id: "f", kind: "formula", label: "F", op: "and", refs: ["a", "ghost"] }],
    };
    const l = layoutMap(broken, 900);
    expect(l.edges).toHaveLength(1);
    expect(l.nodes).toHaveLength(2);
  });

  it("handles a cycle without looping forever", () => {
    const cyclic: ScenarioMap = {
      id: "c", name: "c",
      nodes: [
        { id: "f", kind: "formula", label: "F", op: "not", refs: ["g"] },
        { id: "g", kind: "formula", label: "G", op: "not", refs: ["f"] },
      ],
    };
    const l = layoutMap(cyclic, 900);
    expect(l.nodes).toHaveLength(2);
    expect(l.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});

// The scrapbook feature: a reader can drag a node anywhere, and the derived
// (barycentre) layout stays the fallback for anything unplaced.
describe("layoutMap with manual positions", () => {
  it("lays out a node at its manual position instead of the derived one", () => {
    const withPos: ScenarioMap = {
      ...diamond,
      nodes: diamond.nodes.map((n) => (n.id === "a" ? { ...n, position: { x: 500, y: 500 } } : n)),
    };
    const l = layoutMap(withPos, 900);
    const a = l.nodes.find((n) => n.id === "a")!;
    expect(a.x).toBeCloseTo(500, 5);
    expect(a.y).toBeCloseTo(500, 5);
  });

  it("keeps a node without a position at its derived slot, unaffected by a sibling's manual position", () => {
    const withPos: ScenarioMap = {
      ...diamond,
      nodes: diamond.nodes.map((n) => (n.id === "a" ? { ...n, position: { x: 500, y: 500 } } : n)),
    };
    const plain = layoutMap(diamond, 900);
    const moved = layoutMap(withPos, 900);
    const plainL = plain.nodes.find((n) => n.id === "l")!;
    const movedL = moved.nodes.find((n) => n.id === "l")!;
    expect(movedL.x).toBeCloseTo(plainL.x, 5);
    expect(movedL.y).toBeCloseTo(plainL.y, 5);
  });

  it("routes an edge to a node's manual position, not its derived one", () => {
    const withPos: ScenarioMap = {
      ...diamond,
      nodes: diamond.nodes.map((n) => (n.id === "top" ? { ...n, position: { x: 700, y: 401 } } : n)),
    };
    const l = layoutMap(withPos, 900);
    const edge = l.edges.find((e) => e.from === "l" && e.to === "top")!;
    expect(edge).toBeTruthy();
    // The bezier's destination end must land on the node's moved centre y.
    expect(edge.path.trim().endsWith("401")).toBe(true);
  });

  it("grows the canvas to contain a node dragged past the derived bounds", () => {
    const withPos: ScenarioMap = {
      ...diamond,
      nodes: diamond.nodes.map((n) => (n.id === "a" ? { ...n, position: { x: 3000, y: 3000 } } : n)),
    };
    const derived = layoutMap(diamond, 900);
    const moved = layoutMap(withPos, 900);
    expect(moved.width).toBeGreaterThan(derived.width);
    expect(moved.height).toBeGreaterThan(derived.height);
    const a = moved.nodes.find((n) => n.id === "a")!;
    expect(a.x + NODE_W / 2).toBeLessThanOrEqual(moved.width);
    expect(a.y + NODE_H / 2).toBeLessThanOrEqual(moved.height);
  });

  it("clamps a manual position so a node cannot be dragged above or left of the canvas origin", () => {
    const withPos: ScenarioMap = {
      ...diamond,
      nodes: diamond.nodes.map((n) => (n.id === "a" ? { ...n, position: { x: -500, y: -500 } } : n)),
    };
    const l = layoutMap(withPos, 900);
    const a = l.nodes.find((n) => n.id === "a")!;
    expect(a.x - NODE_W / 2).toBeGreaterThanOrEqual(0);
    expect(a.y - NODE_H / 2).toBeGreaterThanOrEqual(0);
  });
});
