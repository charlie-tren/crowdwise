"use client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import type { Market } from "@/lib/types";

export function LegBars({ legs }: { legs: Market[] }) {
  const data = legs.map((l) => ({ name: l.title.slice(0, 40), prob: +((l.prob ?? 0) * 100).toFixed(1) }));
  return (
    <div role="img" aria-label="Implied probability by leg for this multi-leg market">
      <ResponsiveContainer width="100%" height={Math.max(160, legs.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "#888", fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={180} tick={{ fill: "#fafafa", fontSize: 11 }} />
          <Bar dataKey="prob" radius={4}>{data.map((_, i) => <Cell key={i} fill="#4c9be8" />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
