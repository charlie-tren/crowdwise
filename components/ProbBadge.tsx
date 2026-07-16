import { pct, probColor } from "@/lib/format";

export function ProbBadge({ prob, decimals = 1, className = "" }: { prob: number | null; decimals?: number; className?: string }) {
  return (
    <span className={`transition-prob font-bold tabular-nums ${className}`} style={{ color: probColor(prob) }}>
      {pct(prob, decimals)}
    </span>
  );
}
