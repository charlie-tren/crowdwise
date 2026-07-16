import { pct, probFill } from "@/lib/format";

export function ProbBadge({
  prob, decimals = 1, className = "", showMeter = false,
}: { prob: number | null; decimals?: number; className?: string; showMeter?: boolean }) {
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className={`font-semibold tabular-nums tracking-[-0.02em] text-[var(--text)] ${className}`}>
        {pct(prob, decimals)}
      </span>
      {showMeter && prob != null && (
        <span className="h-[3px] w-14 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${prob * 100}%`, backgroundColor: probFill(prob) }} />
        </span>
      )}
    </span>
  );
}
