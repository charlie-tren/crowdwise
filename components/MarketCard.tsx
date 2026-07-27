import Link from "next/link";
import { ProbBadge } from "./ProbBadge";
import { Sparkline } from "./charts/Sparkline";
import { fmtVol, daysTo } from "@/lib/format";
import { displayTitle } from "@/lib/highlights";
import type { Market } from "@/lib/types";

export function MarketCard({ m, move, spark }: { m: Market; move?: number; spark?: number[] }) {
  const d = daysTo(m.endDate);
  const resolves = d != null && d >= 0 ? `in ${d}d` : m.endDate || "—";
  const showMove = move != null && Math.abs(move) >= 0.001;
  return (
    <Link
      href={`/market/${encodeURIComponent(m.id)}`}
      className="flex flex-col gap-2.5 rounded-xl border border-white/[0.06] bg-panel/70 p-5 transition-colors hover:border-white/15 hover:bg-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-[var(--text)]">{displayTitle(m)}</span>
        <ProbBadge prob={m.prob} showMeter className="text-2xl" />
      </div>
      <div className="mt-1 flex items-center gap-3 text-[13px] text-muted">
        <span>{m.platform}</span>
        <span>·</span>
        <span>Vol {fmtVol(m.volume)}</span>
        <span>·</span>
        <span>{resolves}</span>
        {(spark || showMove) && (
          <span className="ml-auto flex items-center gap-2">
            {spark && spark.length >= 2 && <Sparkline values={spark} />}
            {showMove && (
              <span className="tabular-nums" style={{ color: (move as number) >= 0 ? "#3fb27f" : "#e0714f" }}>
                {(move as number) >= 0 ? "+" : ""}{((move as number) * 100).toFixed(1)}pp
              </span>
            )}
          </span>
        )}
      </div>
    </Link>
  );
}
