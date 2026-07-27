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

// A retrospective "timing" family ("When will the next U.S. recession start?") is
// split into one market per quarter with IDENTICAL titles, and Kalshi keeps every
// bucket open (close_time at year-end) even for quarters already in the PAST. Any
// single bucket is a dead headline - stale subject, no clean yes/no - so exclude
// the whole family from headline ELIGIBILITY, not just from the "clean" tier. That
// way a transient fetch miss on the cleaner market (Kalshi 429s under load) makes
// the theme fall back to a current indicator (GDP / unemployment / payrolls)
// rather than surfacing a past-quarter bucket on the hero.
const RETROSPECTIVE_TITLE = /\bwhen will the next\b/i;

// Kalshi phrases a Fed hold as "Hike rates by 0bps" and a decision as a long
// "Will the Federal Reserve ... at their July 2026 meeting?" - accurate but an
// awkward hero headline. When a tile IS a parseable Fed outcome, show a clean
// human phrasing instead (the prob/id/link are unchanged - still the same market).
function fedTileTitle(fed: FedProposition): string {
  const when = shortLabel(fed.ym); // "Jul 2026"
  if (fed.action === "hold") return `Fed holds at the ${when} meeting`;
  const verb = fed.action === "hike" ? "hikes" : "cuts";
  if (fed.bps === -1) return `Fed ${verb} at the ${when} meeting`;
  return `Fed ${verb} ${fed.bps}bps at the ${when} meeting`;
}

const MONTHS_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// "…September 2026 meeting" -> "Sep 2026", read from the title when the market
// has no clean endDate (some Polymarket Fed markets don't).
function titleMeetingLabel(title: string): string | null {
  const mt = title.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  if (!mt) return null;
  const i = MONTHS_FULL.indexOf(mt[1].toLowerCase());
  return i < 0 ? null : `${MONTHS_SHORT[i]} ${mt[2]}`;
}

// Cleans the Fed markets that parseFedProposition can't (rate-level, open-ended
// magnitude, per-meeting phrasings with no endDate, count-of-cuts, and "before
// YYYY" horizon markets) into short canonical phrasing. Deliberately scoped to
// the Fed - it never touches the shared parser (which drives cross-venue matching
// and the distribution), and it leaves non-Fed markets and multi-meeting combo
// markets ("Pause-Pause-Pause in the next three decisions") on their raw titles.
// Returns null when nothing matches, so displayTitle falls back to the raw title.
function fedFallbackTitle(m: Market): string | null {
  if (m.category !== "Rates/Fed") return null;
  const t = m.title;
  if (!/\bfed(?:eral reserve)?\b/i.test(t)) return null;
  if (/\becb\b|european central|bank of (japan|england|canada|russia)|\bboj\b|\bboe\b/i.test(t)) return null;
  const when = m.endDate ? shortLabel(m.endDate.slice(0, 7)) : titleMeetingLabel(t);
  let mt: RegExpMatchArray | null;

  // rate level: "upper bound of the federal funds rate be above/below X%"
  if ((mt = t.match(/upper bound of the federal funds rate (?:be|is)?\s*(above|below)\s*([\d.]+)\s*%/i)) && when) {
    return `Fed funds ${mt[1].toLowerCase() === "above" ? ">" : "<"}${mt[2]}% after the ${when} meeting`;
  }
  // open-ended magnitude: "increase/decrease … by 50+ bps"
  if ((mt = t.match(/\b(increase|raise|hike|decrease|lower|cut)s?\b[^?]*?\bby\s+([\d.]+)\+\s*bps/i)) && when) {
    return `Fed ${/increase|raise|hike/i.test(mt[1]) ? "hikes" : "cuts"} ${mt[2]}+bps after the ${when} meeting`;
  }
  // per-meeting magnitude with the month in the title: "decrease … by 25 bps after the September 2026 meeting"
  if ((mt = t.match(/\b(increase|raise|hike|decrease|lower|cut)s?\b[^?]*?\bby\s+([\d.]+)\s*bps\b[^?]*?\bafter the\b/i)) && when) {
    return `Fed ${/increase|raise|hike/i.test(mt[1]) ? "hikes" : "cuts"} ${mt[2]}bps at the ${when} meeting`;
  }
  // per-meeting hold: "no change in Fed interest rates after the July 2026 meeting"
  if (/no change[^?]*\bafter the\b/i.test(t) && when) {
    return `Fed holds at the ${when} meeting`;
  }
  // count of cuts in a year: "Will 3 Fed rate cuts happen in 2026?", "no …", "12 or more …"
  if ((mt = t.match(/\b(no|\d+)\s*(?:or more\s*)?fed rate cuts?\s+happen in\s+(\d{4})/i))) {
    const orMore = /or more/i.test(t);
    const n = mt[1].toLowerCase() === "no" ? "No" : mt[1] + (orMore ? "+" : "");
    const noun = mt[1] === "1" && !orMore ? "cut" : "cuts";
    return `${n} Fed rate ${noun} in ${mt[2]}`;
  }
  // horizon bound level: "Fed's lower/upper bound reach X% or lower/higher before 2027"
  if ((mt = t.match(/\b(lower|upper) bound reach\s+([\d.]+)%?\s*or\s+(lower|higher)\s+before\s+(\d{4})/i))) {
    return `Fed ${mt[1].toLowerCase()} bound ${mt[3].toLowerCase() === "lower" ? "≤" : "≥"}${mt[2]}% before ${mt[4]}`;
  }
  // horizon rate direction: "Fed cut rates before 2027", "raise the target range … before 2027"
  if ((mt = t.match(/\b(cut|lower|decrease|hike|raise|increase)s?\b[^?]*\bbefore\s+(\d{4})/i))) {
    return `Fed ${/cut|lower|decrease/i.test(mt[1]) ? "cuts" : "raises"} rates before ${mt[2]}`;
  }
  return null;
}

// A clean, human display title for any market: canonical phrasing for the Fed
// families (parseable decisions via fedTileTitle, everything else via
// fedFallbackTitle), otherwise the raw title untouched. Used wherever a market
// title is shown (board, cards, ladder) so awkward long-form never reaches users.
export function displayTitle(m: Market): string {
  const fed = parseFedProposition(m);
  if (fed) return fedTileTitle(fed);
  return fedFallbackTitle(m) ?? m.title;
}

// The Rates/Fed headline tile, derived from the SAME Kalshi Fed distribution as
// the on-page Fed viz (its most-likely / modal outcome). The generic headlineOdds
// picks the highest-VOLUME Fed market across venues, which on some days is a
// Polymarket market priced a couple of points away from Kalshi - so the tile could
// show e.g. 75% while the distribution/path/grid below (all Kalshi-only) show 77%.
// Sourcing the tile from the distribution guarantees they agree, and "most likely
// outcome" is the natural headline anyway. Null if there is no Fed distribution.
export function fedHeadlineTile(fed: FedDistribution | null, markets: Market[]): HeadlineTile | null {
  if (!fed || !fed.outcomes.length) return null;
  const modal = fed.outcomes.reduce((a, b) => (b.prob > a.prob ? b : a));
  const mkt = markets.find((m) => m.id === modal.id);
  return {
    category: "Rates/Fed",
    title: fedTileTitle({ ym: fed.ym, action: modal.action, bps: modal.bps }),
    prob: modal.prob,
    volume: mkt?.volume ?? 0,
    id: modal.id,
    platform: "Kalshi",
  };
}

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
    // Prefer a current indicator: drop retrospective timing buckets from the pool,
    // then prefer a clean directional title, falling back within the pool. Only use
    // the retrospective family if it is somehow all a theme has (never drop a tile).
    const eligible = inTheme.filter((m) => !RETROSPECTIVE_TITLE.test(m.title));
    const pool = eligible.length ? eligible : inTheme;
    const clean = pool.filter((m) => !NARROW_TITLE.test(m.title));
    const top = (clean.length ? clean : pool).reduce(byVol);
    const fed = parseFedProposition(top);
    tiles.push({
      category: theme,
      title: fed ? fedTileTitle(fed) : top.title,
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

// ---- Fed meeting grid (per-meeting outcome distributions) ------------------

export interface FedMeeting {
  ym: string;
  label: string; // short "Sep 2026"
  outcomes: FedOutcome[];
  total: number;
}

// Outcome distribution for each of the next `maxMeetings` FOMC meetings, for a
// grid of per-meeting stacked bars. Only meetings with >=2 priced outcomes.
export function fedMeetingGrid(markets: Market[], todayYm?: string, maxMeetings = 6): FedMeeting[] {
  const fedMarkets = parseFedMarkets(markets);
  if (!fedMarkets.length) return [];
  const yms = [...new Set(fedMarkets.map((x) => x.fed.ym))]
    .filter((ym) => (todayYm ? ym >= todayYm : true))
    .sort()
    .slice(0, maxMeetings);
  const out: FedMeeting[] = [];
  for (const ym of yms) {
    const outcomes = meetingOutcomes(fedMarkets, ym);
    if (outcomes.length < 2) continue;
    const total = outcomes.reduce((s, o) => s + o.prob, 0);
    out.push({ ym, label: shortLabel(ym), outcomes, total });
  }
  return out;
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
