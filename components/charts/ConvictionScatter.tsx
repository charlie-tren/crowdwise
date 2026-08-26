"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Label,
} from "recharts";
import { CATEGORIES } from "@/lib/taxonomy";
import { THEME_COLOURS } from "@/lib/themeColours";
import { fmtVol } from "@/lib/format";
import type { ScatterPoint } from "@/lib/mapData";

// Everything between these two is "the crowd hasn't made its mind up".
const CONTESTED_LO = 40;
const CONTESTED_HI = 60;

const AXIS = "#7b869a";
const GRID = "#1b1f2c";

// Log axis: label the decades the eye actually reads, not whatever raw
// tick values recharts picks (which rendered as clipped 8-digit numbers).
const VOL_TICKS = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
// fmtVol is built for one market's volume and prints "1.0M"; a decade tick wants
// the bare decade.
const volTick = (v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : String(v));

function PointTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const contested = p.x >= CONTESTED_LO && p.x <= CONTESTED_HI;
  return (
    <div className="max-w-[280px] rounded-lg border border-[#2a3348] bg-[#0e1117] p-2.5 text-[13px] shadow-lg">
      <div className="font-medium text-[var(--text)]">{p.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: THEME_COLOURS[p.category] ?? "#4c9be8" }}
          />
          {p.category}
        </span>
        <span className="text-[var(--muted-dim)]">·</span>
        <span className="tabular-nums text-[var(--text)]">{p.x}% implied</span>
        <span className="text-[var(--muted-dim)]">·</span>
        <span className="tabular-nums">{fmtVol(p.y)} volume</span>
      </div>
      {contested && <div className="mt-1 text-[12px] text-[var(--muted-dim)]">In the contested band</div>}
    </div>
  );
}

export function ConvictionScatter({ points }: { points: ScatterPoint[] }) {
  const router = useRouter();
  // The key doubles as the filter: clicking a theme drops it out of the cloud,
  // which is the only way to read a category that sits under the others.
  const [off, setOff] = useState<Set<string>>(new Set());
  const shown = useMemo(() => points.filter((p) => !off.has(p.category)), [points, off]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of points) c.set(p.category, (c.get(p.category) ?? 0) + 1);
    return c;
  }, [points]);

  if (!points.length) return <p className="text-sm text-muted">No markets to map.</p>;

  const toggle = (cat: string) =>
    setOff((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  const onPointClick = (data: unknown) => {
    const d = data as { id?: string; payload?: { id?: string } } | undefined;
    const id = d?.id ?? d?.payload?.id;
    if (id) router.push("/market/" + encodeURIComponent(id));
  };

  return (
    <div>
      {/* Key. Every theme present carries its own swatch and count, and clicking
          one takes it out of the cloud. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        {CATEGORIES.filter((c) => counts.has(c)).map((cat) => {
          const c = THEME_COLOURS[cat] ?? "#4c9be8";
          const on = !off.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggle(cat)}
              aria-pressed={on}
              title={on ? `Hide ${cat}` : `Show ${cat}`}
              className={"flex items-center gap-1.5 transition-colors " + (on ? "text-muted hover:text-[var(--text)]" : "text-[var(--muted-dim)]")}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: on ? c : "transparent", border: `1.5px solid ${c}`, opacity: on ? 1 : 0.5 }}
              />
              <span className={on ? "" : "line-through"}>{cat}</span>
              <span className="tabular-nums text-[var(--muted-dim)]">{counts.get(cat)}</span>
            </button>
          );
        })}
        {/* Hint only where there is room for it - at 390px it ran off the edge. */}
        <span className="ml-auto hidden text-[var(--muted-dim)] sm:inline">click a theme to hide it</span>
      </div>

      <div
        role="img"
        aria-label="Conviction scatter: implied probability versus trading volume by market theme"
      >
        <ResponsiveContainer width="100%" height={460}>
          <ScatterChart margin={{ top: 12, right: 20, bottom: 34, left: 12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />

            {/* The point of the chart: dots inside this band are the genuinely
                undecided markets, and the higher they sit the more money agrees
                that nobody knows. */}
            <ReferenceArea
              x1={CONTESTED_LO} x2={CONTESTED_HI}
              fill="#4c9be8" fillOpacity={0.08} stroke="none"
              ifOverflow="extendDomain"
            />
            <ReferenceLine x={50} stroke="#5a6478" strokeDasharray="3 3">
              <Label value="contested" position="top" fill={AXIS} fontSize={11} />
            </ReferenceLine>

            <XAxis
              type="number" dataKey="x" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`}
              stroke={GRID}
            >
              <Label
                value="Implied probability - certain no (left) to certain yes (right)"
                position="insideBottom" offset={-22} fill={AXIS} fontSize={11}
              />
            </XAxis>
            <YAxis
              type="number" dataKey="y" scale="log" domain={["auto", "auto"]}
              ticks={VOL_TICKS} tickFormatter={volTick}
              tick={{ fill: AXIS, fontSize: 11 }} width={54} stroke={GRID}
            >
              <Label
                value="Volume traded (log)" angle={-90}
                position="insideLeft" offset={2} style={{ textAnchor: "middle" }}
                fill={AXIS} fontSize={11}
              />
            </YAxis>

            <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "#2a3348" }} content={<PointTooltip />} />

            {CATEGORIES.map((cat) => (
              <Scatter
                key={cat}
                name={cat}
                data={shown.filter((p) => p.category === cat)}
                fill={THEME_COLOURS[cat] ?? "#4c9be8"}
                fillOpacity={0.75}
                stroke="#0e1117"
                strokeWidth={1}
                cursor="pointer"
                onClick={onPointClick}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
