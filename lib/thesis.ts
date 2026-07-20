import type { Market } from "./types";
import { jointYes } from "./scenario";

// Named macro views ("theses") expressed as a basket of legs. Each leg is a
// PREDICATE over the live board (market IDs churn, so we never hardcode them) and
// resolves to the best-volume matching market at render time; the resolved market
// is shown explicitly so the basket's contents are transparent. The thesis's
// combined odds = joint probability of all resolved legs (independence assumed -
// a bound, not gospel, since macro legs are correlated).

export type Side = "yes" | "no";

export interface ThesisLeg {
  label: string;
  side: Side; // take YES or NO of the matched market
  match: (title: string, m: Market) => boolean;
}

export interface Thesis {
  key: string;
  name: string;
  summary: string;
  legs: ThesisLeg[];
}

export interface ResolvedLeg {
  label: string;
  side: Side;
  market: Market | null;
  prob: number | null; // side-adjusted (1 - p for NO)
}

export interface ResolvedThesis {
  key: string;
  name: string;
  summary: string;
  legs: ResolvedLeg[];
  jointProb: number | null; // over resolved legs only
  resolvedCount: number;
  totalLegs: number;
}

// ---- shared leg predicates -------------------------------------------------

const isRecession = (t: string, m: Market): boolean =>
  m.category === "Growth/Recession" &&
  t.includes("recession") &&
  /\bu\.?s\.?\b|united states|american/.test(t) &&
  !t.includes("when will"); // avoid the multi-bucket "when will the next recession start?"

const isFedEase = (t: string): boolean => /cut rates before 2027/.test(t);

const isNoCuts = (t: string): boolean => /no fed rate cuts/.test(t) && t.includes("2026");

const isUnempUp = (t: string): boolean =>
  t.includes("unemployment") && /(reach|at least)[^%]*5(\.0)?\s*%/.test(t);

export const THESES: Thesis[] = [
  {
    key: "recession",
    name: "Recession in 2026",
    summary: "Growth rolls over and the Fed is forced to ease.",
    legs: [
      { label: "US recession in 2026", side: "yes", match: isRecession },
      { label: "Fed cuts rates before 2027", side: "yes", match: (t) => isFedEase(t) },
    ],
  },
  {
    key: "soft-landing",
    name: "Soft landing",
    summary: "No recession, and the Fed still eases.",
    legs: [
      { label: "No US recession in 2026", side: "no", match: isRecession },
      { label: "Fed cuts rates before 2027", side: "yes", match: (t) => isFedEase(t) },
    ],
  },
  {
    key: "higher-for-longer",
    name: "Higher for longer",
    summary: "No recession and the Fed holds through 2026.",
    legs: [
      { label: "No US recession in 2026", side: "no", match: isRecession },
      { label: "No Fed rate cuts in 2026", side: "yes", match: (t) => isNoCuts(t) },
    ],
  },
  {
    key: "hard-landing",
    name: "Hard landing",
    summary: "Recession alongside a rising unemployment rate.",
    legs: [
      { label: "US recession in 2026", side: "yes", match: isRecession },
      { label: "Unemployment reaches 5%+ in 2026", side: "yes", match: (t) => isUnempUp(t) },
    ],
  },
];

function bestMatch(markets: Market[], leg: ThesisLeg): Market | null {
  let best: Market | null = null;
  for (const m of markets) {
    if (m.prob == null) continue;
    if (!leg.match(m.title.toLowerCase(), m)) continue;
    if (!best || m.volume > best.volume) best = m;
  }
  return best;
}

export function resolveThesis(thesis: Thesis, markets: Market[]): ResolvedThesis {
  const legs: ResolvedLeg[] = thesis.legs.map((leg) => {
    const market = bestMatch(markets, leg);
    const prob =
      market?.prob == null ? null : leg.side === "no" ? 1 - market.prob : market.prob;
    return { label: leg.label, side: leg.side, market, prob };
  });
  const resolvedProbs = legs.map((l) => l.prob).filter((p): p is number => p != null);
  const jointProb = resolvedProbs.length ? jointYes(resolvedProbs) : null;
  return {
    key: thesis.key,
    name: thesis.name,
    summary: thesis.summary,
    legs,
    jointProb,
    resolvedCount: resolvedProbs.length,
    totalLegs: legs.length,
  };
}

export function resolveTheses(markets: Market[]): ResolvedThesis[] {
  return THESES.map((t) => resolveThesis(t, markets));
}
