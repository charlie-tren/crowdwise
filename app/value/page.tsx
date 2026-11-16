import type { Metadata } from "next";
import { StrikeLadders } from "@/components/StrikeLadders";
import { DistributionCurve } from "@/components/charts/DistributionCurve";
import { getBuildBoard } from "@/lib/buildBoard";
import { buildStrikeLadders } from "@/lib/relativeValue";
import { ladderToDistribution, probsToDistribution, type Distribution } from "@/lib/distribution";
import { fetchKalshiMarketHistory } from "@/lib/sources";

export const metadata: Metadata = {
  title: "Relative value - Crowdwise",
  // Paired with the lede on this page - keep identical.
  description:
    "Market-implied strike ladders - the probability across thresholds for each macro metric, in effect the market's implied distribution.",
  alternates: { canonical: "/value" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function periodLabel(period: string): string {
  const [y, mo] = period.split("-");
  return mo ? `${MONTHS[Number(mo) - 1] ?? mo} ${y}` : y;
}

export default async function ValuePage() {
  const { markets } = await getBuildBoard();
  const ladders = buildStrikeLadders(markets);
  const flagged = ladders.filter((l) => l.hasViolation).length;

  // Feature a CPI family for the implied distribution. Prefer the highest-volume
  // KALSHI-backed family (its rungs carry a `series`, so we can fetch candlestick
  // history and render the 7d ghost); fall back to the overall highest-volume CPI
  // family (e.g. a Polymarket annual one, which has no history -> no ghost).
  const cpiLadders = ladders
    .filter((l) => l.metric === "CPI inflation")
    .sort((a, b) => b.volume - a.volume);
  const cpiLadder = cpiLadders.find((l) => l.rungs.every((r) => r.series)) ?? cpiLadders[0];

  let current: Distribution | null = null;
  let ghost: Distribution | null = null;

  if (cpiLadder) {
    current = ladderToDistribution(cpiLadder);

    // 7-day ghost: take each rung's OLDEST candlestick point (~7d ago) and
    // rebuild the past distribution. Bounded by Promise.allSettled; a failed or
    // empty fetch on any rung drops the ghost (a partial distribution would
    // misrepresent the drift). Kalshi may 429 under load - handled gracefully.
    const results = await Promise.allSettled(
      cpiLadder.rungs.map((r) =>
        fetchKalshiMarketHistory(r.series, r.id, { days: 7, periodInterval: 60 }),
      ),
    );
    const past = cpiLadder.rungs.map((r, i) => {
      const res = results[i];
      if (res.status === "fulfilled" && res.value.length > 0) {
        return { threshold: r.threshold, prob: res.value[0][1] }; // oldest point
      }
      return null;
    });
    if (past.every((p): p is { threshold: number; prob: number } => p != null)) {
      ghost = probsToDistribution(past, cpiLadder.direction, cpiLadder.metric, cpiLadder.period);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.02em]">Relative value</h1>
      <p className="mb-2 text-[13px] text-muted">
        Market-implied strike ladders - the probability across thresholds for each macro metric (in effect, the
        market&apos;s implied distribution). A family must be monotone: a higher &quot;above&quot; threshold can only be
        less likely. Any rung priced richer than a lower one is a logical inconsistency, flagged in amber.
      </p>
      <p className="mb-6 text-[13px] text-[var(--muted-dim)]">
        {flagged > 0
          ? `${flagged} ladder${flagged === 1 ? "" : "s"} with an inconsistency right now.`
          : "No inconsistencies right now - every ladder is internally consistent."}
        {" "}For information only - not financial advice.
      </p>

      {current && (
        <section className="mb-8 rounded-2xl border border-white/[0.06] bg-panel/60 p-5">
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold text-[var(--text)]">
              Implied distribution - {current.metric}, {periodLabel(current.period)}
            </h2>
            <p className="text-[12px] text-muted">
              The featured CPI ladder&apos;s strikes turned into a probability histogram: where the market thinks the
              print lands.
            </p>
          </div>
          <DistributionCurve current={current} ghost={ghost} />
        </section>
      )}

      <StrikeLadders ladders={ladders} />
    </div>
  );
}
