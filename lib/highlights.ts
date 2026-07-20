import type { Category } from "./taxonomy";
import { parseFedProposition, type FedAction, type FedProposition } from "./crossVenue";
import type { Market } from "./types";

// ---- Headline odds tiles ---------------------------------------------------

export interface HeadlineTile {
  category: Category;
  title: string;
  prob: number;
  volume: number;
  id: string;
  platform: "Kalshi" | "Polymarket";
}

// A "narrow" market is one that reads badly as a standalone headline: a single
// strike/threshold/date-bucket out of a family (e.g. "CPI above 3.5%", "WTI
// >116.99 on Nov 3", "When will the next recession start?"). We prefer a clean
// directional yes/no ("US recession in 2026?", "No change after the July meeting")
// for the hero tile, falling back to raw top-volume only if the theme has nothing
// cleaner.
const NARROW_TITLE = /\bwhen will\b|\babove\b|\bbelow\b|\bbetween\b|>|<|\breach\b|\d+(?:\.\d+)?%|\bor (?:higher|lower)\b/i;

// The best headline market in each requested theme, in the given theme order.
// Robust to whatever markets happen to be live - always populated as long as the
// theme has any market. Used for the home-page hero.
export function headlineOdds(
  markets: Market[],
  themes: Category[] = ["Rates/Fed", "Growth/Recession", "Inflation", "Commodities/Oil"],
): HeadlineTile[] {
  const tiles: HeadlineTile[] = [];
  for (const theme of themes) {
    const inTheme = markets.filter((m) => m.category === theme && m.prob != null && m.volume > 0);
    if (!inTheme.length) continue;
    const byVol = (best: Market, m: Market) => (m.volume > best.volume ? m : best);
    const clean = inTheme.filter((m) => !NARROW_TITLE.test(m.title));
    const top = (clean.length ? clean : inTheme).reduce(byVol);
    tiles.push({
      category: theme,
      title: top.title,
      prob: top.prob as number,
      volume: top.volume,
      id: top.id,
      platform: top.platform,
    });
  }
  return tiles;
}

// ---- Fed decision distribution ---------------------------------------------

export interface FedOutcome {
  label: string;
  action: FedAction;
  bps: number;
  prob: number;
  id: string;
}

export interface FedDistribution {
  ym: string;
  outcomes: FedOutcome[];
  total: number; // sum of outcome probs; ~1 when the market is complete
}

function outcomeLabel(action: FedAction, bps: number): string {
  if (action === "hold") return "Hold";
  const verb = action === "hike" ? "Hike" : "Cut";
  if (bps === -1) return `${verb} >`;
  return `${verb} ${bps}`;
}

// cuts (deepest first) ... hold ... hikes (largest last)
function outcomeRank(o: FedOutcome): number {
  if (o.action === "cut") return -1000 - (o.bps === -1 ? 1e6 : o.bps);
  if (o.action === "hold") return 0;
  return 1000 + (o.bps === -1 ? 1e6 : o.bps);
}

type FedMarket = { m: Market; fed: FedProposition };

function parseFedMarkets(markets: Market[]): FedMarket[] {
  return markets
    .filter((m) => m.platform === "Kalshi")
    .map((m) => ({ m, fed: parseFedProposition(m) }))
    .filter((x): x is FedMarket => x.fed != null && x.m.prob != null);
}

// Best-volume market per distinct outcome for one meeting, sorted cut->hold->hike.
function meetingOutcomes(fedMarkets: FedMarket[], ym: string): FedOutcome[] {
  const byOutcome = new Map<string, FedMarket>();
  for (const x of fedMarkets) {
    if (x.fed.ym !== ym) continue;
    const key = `${x.fed.action}|${x.fed.bps}`;
    const cur = byOutcome.get(key);
    if (!cur || x.m.volume > cur.m.volume) byOutcome.set(key, x);
  }
  return [...byOutcome.values()]
    .map((x) => ({
      label: outcomeLabel(x.fed.action, x.fed.bps),
      action: x.fed.action,
      bps: x.fed.bps,
      prob: x.m.prob as number,
      id: x.m.id,
    }))
    .sort((a, b) => outcomeRank(a) - outcomeRank(b));
}

// The nearest upcoming FOMC meeting's outcome distribution, built from Kalshi's
// per-outcome Fed markets (Kalshi lists one clean yes/no market per outcome, so
// the probs form a genuine distribution). Returns null unless at least two
// distinct outcomes are priced for a meeting. `todayYm` ("YYYY-MM") selects the
// nearest meeting at or after today; omit to just take the earliest meeting.
export function fedDistribution(markets: Market[], todayYm?: string): FedDistribution | null {
  const fedMarkets = parseFedMarkets(markets);
  if (!fedMarkets.length) return null;

  const yms = [...new Set(fedMarkets.map((x) => x.fed.ym))].sort();
  const upcoming = todayYm ? yms.filter((ym) => ym >= todayYm) : yms;
  const ym = (upcoming.length ? upcoming : yms)[0];

  const outcomes = meetingOutcomes(fedMarkets, ym);
  if (outcomes.length < 2) return null;
  const total = outcomes.reduce((s, o) => s + o.prob, 0);
  return { ym, outcomes, total };
}

// ---- Fed implied path ------------------------------------------------------

export interface FedPathPoint {
  ym: string;
  label: string;        // short "Sep 2026"
  expectedBps: number;  // probability-weighted signed change AT this meeting
  cumulativeBps: number; // running sum from the first upcoming meeting
}

// Signed magnitude of an outcome: hikes +, cuts -, hold 0. Open-ended (">Nbps")
// buckets are given a nominal 50bp magnitude.
function signedBps(o: FedOutcome): number {
  if (o.action === "hold") return 0;
  const mag = o.bps === -1 ? 50 : o.bps;
  return o.action === "hike" ? mag : -mag;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortLabel(ym: string): string {
  const [y, mo] = ym.split("-");
  return `${MONTHS_SHORT[Number(mo) - 1] ?? mo} ${y}`;
}

// The market-implied cumulative rate path across upcoming FOMC meetings, in bps
// RELATIVE to today (no absolute rate level needed): each meeting contributes its
// probability-weighted expected signed change, accumulated. Only meetings with a
// genuine multi-outcome distribution (>=2 priced outcomes) are included.
export function fedPath(markets: Market[], todayYm?: string, maxMeetings = 8): FedPathPoint[] {
  const fedMarkets = parseFedMarkets(markets);
  if (!fedMarkets.length) return [];

  const yms = [...new Set(fedMarkets.map((x) => x.fed.ym))]
    .filter((ym) => (todayYm ? ym >= todayYm : true))
    .sort()
    .slice(0, maxMeetings);

  const points: FedPathPoint[] = [];
  let cumulative = 0;
  for (const ym of yms) {
    const outcomes = meetingOutcomes(fedMarkets, ym);
    if (outcomes.length < 2) continue;
    const total = outcomes.reduce((s, o) => s + o.prob, 0);
    if (total <= 0) continue;
    const expectedBps = outcomes.reduce((s, o) => s + (o.prob / total) * signedBps(o), 0);
    cumulative += expectedBps;
    points.push({
      ym,
      label: shortLabel(ym),
      expectedBps: Math.round(expectedBps * 10) / 10,
      cumulativeBps: Math.round(cumulative * 10) / 10,
    });
  }
  return points;
}
