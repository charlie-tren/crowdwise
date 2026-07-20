import type { Metadata } from "next";
import { StrikeLadders } from "@/components/StrikeLadders";
import { fetchTopMarkets } from "@/lib/board";
import { buildStrikeLadders } from "@/lib/relativeValue";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = { title: "Relative value · Crowdwise" };

export default async function ValuePage() {
  const markets = await fetchTopMarkets();
  const ladders = buildStrikeLadders(markets);
  const flagged = ladders.filter((l) => l.hasViolation).length;

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
      <StrikeLadders ladders={ladders} />
    </div>
  );
}
