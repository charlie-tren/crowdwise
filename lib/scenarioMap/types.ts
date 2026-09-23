// A map is a set of nodes. There are no edge objects: a formula node names the
// ids it reads, and the arrows on screen are derived from those names. That is
// the whole reason this is not a free canvas - there is no second structure that
// can disagree with the maths.

export type Operator = "and" | "or" | "not" | "mix" | "depends";

export interface MarketNode {
  id: string;
  kind: "market";
  label: string;
  marketId: string;      // Market.id from the board; "" when a leg has no market
  side: "yes" | "no";
  // A reader's what-if for this node, in the SAME 0..1, side-adjusted space as
  // the node's own displayed figure - not the raw venue price. Optional, and
  // absent is the ordinary state: the live board price is used until a reader
  // drags this node, exactly as with an input node's low/likely/high. The
  // node's own live price is never altered or hidden by setting this - see
  // NodeResult.livePrice, which always carries it separately for display.
  override?: number;
}

export interface InputNode {
  id: string;
  kind: "input";
  label: string;
  low: number;           // 0..1
  likely: number;        // 0..1
  high: number;          // 0..1
  source: string;        // "Charlie", "3 of 12 post-war cycles", a URL
}

export interface FormulaNode {
  id: string;
  kind: "formula";
  label: string;
  op: Operator;
  // For "depends" the order is [condition, ifConditionYes, ifConditionNo].
  // For "not" there is exactly one ref.
  refs: string[];
  weights?: number[];    // "mix" only, same length as refs
}

export type MapNode = MarketNode | InputNode | FormulaNode;

export interface ScenarioMap {
  id: string;
  name: string;
  nodes: MapNode[];
  builtIn?: boolean;
}

export interface NodeResult {
  id: string;
  status: "ok" | "unresolved";
  reason?: string;       // set when unresolved, shown to the reader
  p50: number | null;
  p10: number | null;
  p90: number | null;
  // Market nodes only: the venue's own current price, side-adjusted the same
  // way p50 is, independent of any what-if override on this node. Present
  // whenever a market node has a usable live price, whether or not it is
  // currently overridden - this is what lets the reader see the real number
  // alongside a what-if. Absent (undefined) for input/formula nodes and for a
  // market with no usable live price at all.
  livePrice?: number | null;
}
