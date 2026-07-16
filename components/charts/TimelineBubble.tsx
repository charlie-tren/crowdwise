"use client";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { probColor } from "@/lib/format";
import type { Market } from "@/lib/types";

export function TimelineBubble({ markets }: { markets: Market[] }) {
  const data = markets
    .filter((m) => m.prob != null && m.endDate)
    .map((m) => ({ x: new Date(`${m.endDate}T00:00:00Z`).getTime(), y: +((m.prob as number) * 100).toFixed(1), z: m.volume || 1, title: m.title, prob: m.prob as number }));
  if (!data.length) return <p className="text-sm text-muted">No dated markets match the selected themes.</p>;

  const xs = data.map((d) => d.x);
  const dataMin = Math.min(...xs);
  const dataMax = Math.max(...xs);
  const twoWeeksMs = 14 * 86_400_000;
  const pad = Math.max((dataMax - dataMin) * 0.05, twoWeeksMs);
  const paddedMin = dataMin - pad;
  const paddedMax = dataMax + pad;

  return (
    <div role="img" aria-label="Timeline of market resolution dates versus implied probability, bubble size by volume">
      <ResponsiveContainer width="100%" height={480}>
        <ScatterChart margin={{ top: 10, right: 24, bottom: 8, left: 24 }}>
          <CartesianGrid stroke="#1e2130" />
          <XAxis type="number" dataKey="x" domain={[paddedMin, paddedMax]} name="Resolves"
            tickFormatter={(t) => new Date(t).toISOString().slice(0, 10)} tick={{ fill: "#888", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, 100]} name="P" tick={{ fill: "#888", fontSize: 11 }} width={36} />
          <ZAxis type="number" dataKey="z" range={[40, 800]} />
          <ReferenceLine
            x={Date.now()}
            stroke="#fafafa"
            strokeDasharray="4 3"
            label={{ value: "today", position: "top", fill: "#fafafa", fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{ background: "#0e1117", border: "1px solid #1e2130" }}
            formatter={(v, n) => (n === "P" ? [`${v}%`, "P"] : [v, n])}
            labelFormatter={() => ""}
          />
          <Scatter data={data}>{data.map((d, i) => <Cell key={i} fill={probColor(d.prob)} fillOpacity={0.85} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
