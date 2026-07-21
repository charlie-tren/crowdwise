"use client";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Distribution } from "@/lib/distribution";

const ACCENT = "#4c9be8";
const GHOST = "#9aa4b2";
const GRID = "#1e2130";
const AXIS = "#6b7280";
const TEXT = "#fafafa";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function periodLabel(period: string): string {
  const [y, mo] = period.split("-");
  return mo ? `${MONTHS[Number(mo) - 1] ?? mo} ${y}` : y;
}

const fmtEdge = (n: number) => (Number.isInteger(n) ? n.toFixed(0) : String(n));

function bucketLabel(lo: number | null, hi: number | null): string {
  if (lo == null && hi != null) return `< ${fmtEdge(hi)}%`;
  if (hi == null && lo != null) return `> ${fmtEdge(lo)}%`;
  if (lo != null && hi != null) return `${fmtEdge(lo)}-${fmtEdge(hi)}%`;
  return "";
}

interface Row {
  label: string;
  massPct: number;
  ghostPct: number | null;
}

function CurveTooltip({ active, payload, hasGhost }: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  hasGhost: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const drift = row.ghostPct != null ? row.massPct - row.ghostPct : null;
  const driftStr =
    drift == null
      ? null
      : `${drift >= 0 ? "+" : ""}${drift.toFixed(1)}pp vs 7d ago`;
  return (
    <div
      style={{
        background: "#0e1117",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: TEXT,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.label}</div>
      <div style={{ color: ACCENT }}>Now: {row.massPct.toFixed(1)}%</div>
      {hasGhost && row.ghostPct != null && (
        <div style={{ color: GHOST }}>7d ago: {row.ghostPct.toFixed(1)}%</div>
      )}
      {driftStr && <div style={{ color: AXIS, marginTop: 2 }}>{driftStr}</div>}
    </div>
  );
}

export function DistributionCurve({
  current,
  ghost,
}: {
  current: Distribution;
  ghost?: Distribution | null;
}) {
  const ghostByLabel = new Map<string, number>();
  if (ghost) {
    for (const b of ghost.buckets) {
      ghostByLabel.set(bucketLabel(b.lo, b.hi), b.mass * 100);
    }
  }

  const data: Row[] = current.buckets.map((b) => {
    const label = bucketLabel(b.lo, b.hi);
    const g = ghostByLabel.get(label);
    return { label, massPct: b.mass * 100, ghostPct: g == null ? null : g };
  });

  const hasGhost = Boolean(ghost) && data.some((d) => d.ghostPct != null);
  const cmp = current.direction === "above" ? ">" : "<";
  const ariaLabel =
    `Implied probability distribution for ${current.metric}, ${periodLabel(current.period)}. ` +
    `Bars show the market-implied probability mass in each metric range` +
    (hasGhost ? ", with a dashed line showing the distribution 7 days ago." : ".");

  return (
    <figure className="m-0" role="img" aria-label={ariaLabel}>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ACCENT }} />
          Now
        </span>
        {hasGhost && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke={GHOST} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            7 days ago
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: AXIS, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            interval={0}
          />
          <YAxis
            tick={{ fill: AXIS, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<CurveTooltip hasGhost={hasGhost} />}
          />
          <Bar dataKey="massPct" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={ACCENT} />
            ))}
          </Bar>
          {hasGhost && (
            <Line
              type="monotone"
              dataKey="ghostPct"
              stroke={GHOST}
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeOpacity={0.85}
              dot={{ r: 3, fill: GHOST, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <figcaption className="mt-2 text-[12px] text-[var(--muted-dim)]">
        Implied probability that {current.metric} for {periodLabel(current.period)} lands in each range,
        derived from the P(value {cmp} threshold) strike ladder. Open end buckets ({"<"} lowest and {">"} highest
        strike) carry the tail mass.
        {hasGhost
          ? " The dashed line is the same distribution 7 days ago - the gap shows the week's drift."
          : ""}
      </figcaption>
    </figure>
  );
}
