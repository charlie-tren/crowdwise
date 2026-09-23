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
}
