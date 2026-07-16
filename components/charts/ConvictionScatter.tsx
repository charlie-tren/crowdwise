"use client";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { CATEGORIES } from "@/lib/taxonomy";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { ScatterPoint } from "@/lib/mapData";

export function ConvictionScatter({ points }: { points: ScatterPoint[] }) {
  if (!points.length) return <p className="text-sm text-muted">No markets to map.</p>;
  return (
    <div
      role="img"
      aria-label="Conviction scatter: implied probability versus trading volume by market theme"
    >
      <ResponsiveContainer width="100%" height={460}>
        <ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="#1e2130" />
          <XAxis
            type="number" dataKey="x" domain={[0, 100]} name="Implied probability (%)"
            tick={{ fill: "#888", fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="y" scale="log" domain={["auto", "auto"]} name="Volume (log)"
            tick={{ fill: "#888", fontSize: 11 }} width={48}
          />
          <ReferenceLine x={50} stroke="#888" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: "#0e1117", border: "1px solid #1e2130", color: "#fafafa" }}
            formatter={(value, name) => (name === "Implied probability (%)" ? [`${value}%`, name] : [value, name])}
            labelFormatter={() => ""}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {CATEGORIES.map((cat) => (
            <Scatter
              key={cat}
              name={cat}
              data={points.filter((p) => p.category === cat)}
              fill={THEME_COLOURS[cat] ?? "#4c9be8"}
              fillOpacity={0.6}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
