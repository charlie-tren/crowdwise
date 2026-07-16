import Link from "next/link";
import { ProbBadge } from "./ProbBadge";
import { fmtVol, daysTo } from "@/lib/format";
import type { Market } from "@/lib/types";

export function MarketCard({ m, move }: { m: Market; move?: number }) {
  const d = daysTo(m.endDate);
  const resolves = d != null && d >= 0 ? `in ${d}d` : m.endDate || "—";
  return (
    <Link
      href={`/market/${encodeURIComponent(m.id)}`}
      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-panel/70 p-4 shadow-sm shadow-black/30 transition-colors hover:border-white/25 hover:bg-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="line-clamp-2 text-sm leading-snug text-[var(--text)]">{m.title}</span>
        <ProbBadge prob={m.prob} className="text-xl" />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>{m.platform}</span>
        <span>·</span>
        <span>Vol {fmtVol(m.volume)}</span>
        <span>·</span>
        <span>{resolves}</span>
        {move != null && Math.abs(move) >= 0.001 && (
          <span className="ml-auto tabular-nums" style={{ color: move >= 0 ? "#22c55e" : "#ef4444" }}>
            {move >= 0 ? "+" : ""}{(move * 100).toFixed(1)}pp
          </span>
        )}
      </div>
    </Link>
  );
}
