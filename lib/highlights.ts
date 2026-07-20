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

// The single highest-volume market (with a prob) in each requested theme, in the
// given theme order. Robust to whatever markets happen to be live - always
// populated as long as the theme has any market. Used for the home-page hero.
export function headlineOdds(
  markets: Market[],
  themes: Category[] = ["Rates/Fed", "Growth/Recession", "Inflation", "Commodities/Oil"],
): HeadlineTile[] {
  const tiles: HeadlineTile[] = [];
  for (const theme of themes) {
    const inTheme = markets.filter((m) => m.category === theme && m.prob != null && m.volume > 0);
    if (!inTheme.length) continue;
    const top = inTheme.reduce((best, m) => (m.volume > best.volume ? m : best));
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

// The nearest upcoming FOMC meeting's outcome distribution, built from Kalshi's
// per-outcome Fed markets (Kalshi lists one clean yes/no market per outcome, so
// the probs form a genuine distribution). Returns null unless at least two
// distinct outcomes are priced for a meeting. `todayYm` ("YYYY-MM") selects the
// nearest meeting at or after today; omit to just take the earliest meeting.
export function fedDistribution(markets: Market[], todayYm?: string): FedDistribution | null {
  const fedMarkets = markets
    .filter((m) => m.platform === "Kalshi")
    .map((m) => ({ m, fed: parseFedProposition(m) }))
    .filter((x): x is { m: Market; fed: FedProposition } => x.fed != null);
  if (!fedMarkets.length) return null;

  const yms = [...new Set(fedMarkets.map((x) => x.fed.ym))].sort();
  const upcoming = todayYm ? yms.filter((ym) => ym >= todayYm) : yms;
  const ym = (upcoming.length ? upcoming : yms)[0];

  const byOutcome = new Map<string, { m: Market; fed: FedProposition }>();
  for (const x of fedMarkets) {
    if (x.fed.ym !== ym) continue;
    if (x.m.prob == null) continue;
    const key = `${x.fed.action}|${x.fed.bps}`;
    const cur = byOutcome.get(key);
    if (!cur || x.m.volume > cur.m.volume) byOutcome.set(key, x);
  }

  const outcomes: FedOutcome[] = [...byOutcome.values()]
    .map((x) => ({
      label: outcomeLabel(x.fed.action, x.fed.bps),
      action: x.fed.action,
      bps: x.fed.bps,
      prob: x.m.prob as number,
      id: x.m.id,
    }))
    .sort((a, b) => outcomeRank(a) - outcomeRank(b));

  if (outcomes.length < 2) return null;
  const total = outcomes.reduce((s, o) => s + o.prob, 0);
  return { ym, outcomes, total };
}
