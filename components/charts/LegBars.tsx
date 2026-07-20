"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  LabelList,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { probFill } from "@/lib/format";
import type { Market } from "@/lib/types";

export function LegBars({ legs }: { legs: Market[] }) {
  const data = legs.map((l) => ({
    name: l.title.length > 44 ? `${l.title.slice(0, 43)}…` : l.title,
    prob: +((l.prob ?? 0) * 100).toFixed(1),
  }));
  return (
    <div role="img" aria-label="Implied probability by leg for this multi-leg market">
      <ResponsiveContainer width="100%" height={Math.max(160, legs.length * 46)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, left: 8, right: 44, bottom: 4 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke="#ffffff" strokeOpacity={0.06} />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: "#9aa4b2", fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            axisLine={{ stroke: "#ffffff", strokeOpacity: 0.1 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={190}
            tick={{ fill: "#fafafa", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={50} stroke="#9aa4b2" strokeOpacity={0.4} strokeDasharray="3 3" />
          <Bar dataKey="prob" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={probFill(d.prob / 100)} />
            ))}
            <LabelList
              dataKey="prob"
              position="right"
              formatter={(v) => `${Math.round(Number(v))}%`}
              fill="#fafafa"
              fontSize={11}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
