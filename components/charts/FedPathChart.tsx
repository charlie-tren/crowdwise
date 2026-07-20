"use client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import type { FedPathPoint } from "@/lib/highlights";

function PathTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FedPathPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <div className="rounded-lg border border-[#2a3348] bg-[#0e1117] p-2.5 text-[13px] shadow-lg">
      <div className="font-medium text-[var(--text)]">{p.label} FOMC</div>
      <div className="mt-1 text-muted">
        This meeting: <span className="tabular-nums text-[var(--text)]">{sign(p.expectedBps)} bps</span>
      </div>
      <div className="text-muted">
        Cumulative: <span className="tabular-nums text-[var(--text)]">{sign(p.cumulativeBps)} bps</span>
      </div>
    </div>
  );
}

// Market-implied cumulative policy-rate change (bps) relative to today, stepped
// across upcoming FOMC meetings. Negative = easing priced in.
export function FedPathChart({ points }: { points: FedPathPoint[] }) {
  if (points.length < 2) return null;
  return (
    <div
      role="img"
      aria-label="Market-implied cumulative Fed rate change in basis points across upcoming meetings"
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#1e2130" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#9aa4b2", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#2a3348" }} />
          <YAxis
            tick={{ fill: "#9aa4b2", fontSize: 11 }} tickLine={false} axisLine={false} width={44}
            tickFormatter={(v) => `${v}`}
            label={{ value: "bps vs today", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11, dy: 40 }}
          />
          <ReferenceLine y={0} stroke="#3a4256" strokeDasharray="3 3" />
          <Tooltip content={<PathTooltip />} cursor={{ stroke: "#2a3348" }} />
          <Line
            type="stepAfter" dataKey="cumulativeBps" stroke="#4c9be8" strokeWidth={2.5}
            dot={{ r: 3, fill: "#4c9be8" }} activeDot={{ r: 5 }} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
