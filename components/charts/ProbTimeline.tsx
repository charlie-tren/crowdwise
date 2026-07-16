"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { HistoryPoint } from "@/lib/types";

export function ProbTimeline({ points }: { points: HistoryPoint[] }) {
  const data = points.map(([ts, p]) => ({ ts: ts.slice(0, 10), prob: +(p * 100).toFixed(1) }));
  if (data.length < 2) return <p className="text-sm text-muted">No price history available for this market.</p>;
  return (
    <div role="img" aria-label="Implied probability history for this market over time">
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#1e2130" />
          <XAxis dataKey="ts" tick={{ fill: "#888", fontSize: 11 }} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fill: "#888", fontSize: 11 }} width={36} />
          <Tooltip
            contentStyle={{ background: "#0e1117", border: "1px solid #1e2130", color: "#fafafa" }}
            formatter={(v) => [`${v}%`, "P"]}
          />
          <Line type="monotone" dataKey="prob" stroke="#4c9be8" strokeWidth={2} dot={false} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
