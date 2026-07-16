"use client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList, CartesianGrid, ReferenceLine } from "recharts";

export interface MoverBar { id: string; title: string; category: string; move: number; }

const truncate = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const formatPp = (v: number) => {
  const pp = v * 100;
  const sign = pp >= 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
};

export function TopMovers({ movers }: { movers: MoverBar[] }) {
  if (!movers.length) {
    return <p className="text-sm text-muted">No markets moved materially over the last week.</p>;
  }
  const data = movers.map((mv) => ({ name: truncate(mv.title), movePct: mv.move * 100, move: mv.move }));
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.movePct)), 1);

  return (
    <div role="img" aria-label="Top movers: weekly change in implied probability by market, in percentage points">
      <ResponsiveContainer width="100%" height={Math.max(220, movers.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48 }}>
          <CartesianGrid stroke="#1e2130" />
          <XAxis
            type="number" domain={[-maxAbs * 1.15, maxAbs * 1.15]}
            tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}pp`}
          />
          <YAxis type="category" dataKey="name" width={220} tick={{ fill: "#fafafa", fontSize: 11 }} />
          <ReferenceLine x={0} stroke="#888" />
          <Bar dataKey="movePct" radius={4}>
            {data.map((d, i) => <Cell key={i} fill={d.move >= 0 ? "#22c55e" : "#ef4444"} />)}
            <LabelList
              dataKey="move"
              position="right"
              fill="#fafafa"
              fontSize={11}
              formatter={(v) => formatPp(Number(v))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
