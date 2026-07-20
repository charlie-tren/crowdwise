"use client";
import { useRouter } from "next/navigation";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { CATEGORIES } from "@/lib/taxonomy";
import { THEME_COLOURS } from "@/lib/themeColours";
import { fmtVol } from "@/lib/format";
import type { ScatterPoint } from "@/lib/mapData";

function PointTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-[260px] rounded-lg border border-[#2a3348] bg-[#0e1117] p-2.5 text-[13px] shadow-lg">
      <div className="font-medium text-[var(--text)]">{p.title}</div>
      <div className="mt-1 flex items-center gap-2 text-muted">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: THEME_COLOURS[p.category] ?? "#4c9be8" }}
        />
        <span>{p.category}</span>
        <span className="text-[var(--muted-dim)]">·</span>
        <span className="tabular-nums text-[var(--text)]">{p.x}%</span>
        <span className="text-[var(--muted-dim)]">·</span>
        <span className="tabular-nums">vol {fmtVol(p.y)}</span>
      </div>
    </div>
  );
}

export function ConvictionScatter({ points }: { points: ScatterPoint[] }) {
  const router = useRouter();
  if (!points.length) return <p className="text-sm text-muted">No markets to map.</p>;
  const onPointClick = (data: unknown) => {
    const d = data as { id?: string; payload?: { id?: string } } | undefined;
    const id = d?.id ?? d?.payload?.id;
    if (id) router.push("/market/" + encodeURIComponent(id));
  };
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
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "#2a3348" }} content={<PointTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {CATEGORIES.map((cat) => (
            <Scatter
              key={cat}
              name={cat}
              data={points.filter((p) => p.category === cat)}
              fill={THEME_COLOURS[cat] ?? "#4c9be8"}
              fillOpacity={0.6}
              cursor="pointer"
              onClick={onPointClick}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
