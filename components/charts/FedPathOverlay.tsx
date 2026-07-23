"use client";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { OverlayRow } from "@/lib/fedFutures";

const FUTURES = "#4c9be8"; // OIS/SOFR futures path (solid)
const CROWD = "#8ea2ff";   // prediction-market path (dashed)
const BAND = "#4c9be8";
const AXIS = "#6b7280";
const GRID = "#1e2130";
const TEXT = "#fafafa";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function tickLabel(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}

function OverlayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: OverlayRow }> }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#2a3348] bg-[#0e1117] p-2.5 text-[13px] shadow-lg">
      <div className="font-medium text-[var(--text)]">{tickLabel(r.ts)}</div>
      {r.futMean != null && (
        <div className="mt-1" style={{ color: FUTURES }}>
          Futures: <span className="tabular-nums">{r.futMean.toFixed(2)}%</span>
          {r.band && r.band[0] !== r.band[1] && (
            <span className="text-muted"> ({r.band[0].toFixed(2)}-{r.band[1].toFixed(2)})</span>
          )}
        </div>
      )}
      {r.crowd != null && (
        <div style={{ color: CROWD }}>
          Prediction market: <span className="tabular-nums">{r.crowd.toFixed(2)}%</span>
        </div>
      )}
    </div>
  );
}

// Two implied policy-rate paths on one axis: the OIS/SOFR futures path (Atlanta
// Fed, mean + 25-75 percentile band) vs the prediction-market implied path
// (Kalshi), both as expected rate LEVEL over time and anchored at today's rate.
export function FedPathOverlay({ rows, asOf }: { rows: OverlayRow[]; asOf: string }) {
  if (rows.length < 2) return null;
  const Swatch = ({ colour, dashed }: { colour: string; dashed?: boolean }) => (
    <svg width="18" height="6" aria-hidden="true">
      <line x1="0" y1="3" x2="18" y2="3" stroke={colour} strokeWidth="2.5" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
  return (
    <figure className="m-0" role="img" aria-label="Futures-implied versus prediction-market-implied Fed policy-rate path">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><Swatch colour={FUTURES} /> Futures (OIS/SOFR)</span>
        <span className="inline-flex items-center gap-1.5"><Swatch colour={CROWD} dashed /> Prediction market</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-[2px]" style={{ background: BAND, opacity: 0.18 }} /> Futures 25-75%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
            tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }}
            tickFormatter={tickLabel}
          />
          <YAxis
            tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={44}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`} domain={["auto", "auto"]}
          />
          <Tooltip content={<OverlayTooltip />} cursor={{ stroke: "#2a3348" }} />
          <Area
            dataKey="band" stroke="none" fill={BAND} fillOpacity={0.15} connectNulls
            isAnimationActive={false} activeDot={false}
          />
          <Line
            type="monotone" dataKey="futMean" stroke={FUTURES} strokeWidth={2.5}
            dot={{ r: 2.5, fill: FUTURES }} connectNulls isAnimationActive={false}
          />
          <Line
            type="monotone" dataKey="crowd" stroke={CROWD} strokeWidth={2.5} strokeDasharray="5 4"
            dot={{ r: 2.5, fill: CROWD }} connectNulls isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <figcaption className="mt-2 text-[12px] text-[var(--muted-dim)]">
        Expected policy-rate path: the futures market (options on SOFR futures, via the Atlanta Fed, as of {asOf})
        against the prediction-market implied path. Both anchored at today&apos;s target midpoint. The futures series
        tracks 3-month SOFR (a few bps below the fed-funds target). Where the dashed line sits above/below the solid
        line, the crowd prices a higher/lower rate than the futures market. Source: Atlanta Fed / CME. Not financial advice.
      </figcaption>
    </figure>
  );
}
