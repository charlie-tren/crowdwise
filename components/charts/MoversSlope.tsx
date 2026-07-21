"use client";
import { useRouter } from "next/navigation";

export interface MoverBar { id: string; title: string; category: string; move: number; }
/** A mover augmented with its current implied probability (0..1). */
export interface SlopeMover extends MoverBar { now: number; }

// Movement direction only (NOT probability magnitude): green up / red down.
const UP = "#3fb27f";
const DOWN = "#e0714f";

const truncate = (s: string, n = 52) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pctLabel = (x: number) => `${Math.round(clamp01(x) * 100)}%`;
const ppLabel = (v: number) => `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(1)}pp`;

export function MoversSlope({ movers }: { movers: SlopeMover[] }) {
  const router = useRouter();
  if (!movers.length) {
    return <p className="text-sm text-muted">No markets moved materially over the last week.</p>;
  }

  return (
    <div
      role="img"
      aria-label="Top movers: each market's implied probability a week ago versus now, shown as a was-to-now dumbbell coloured by direction"
    >
      {/* Legend + axis scale */}
      <div className="mb-3 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: UP }} />
          rose
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: DOWN }} />
          fell
        </span>
        <span className="ml-auto text-[var(--muted-dim)]">track spans 0-100% implied probability</span>
      </div>

      <ul className="flex flex-col divide-y divide-white/5">
        {movers.map((m) => {
          const up = m.move >= 0;
          const colour = up ? UP : DOWN;
          const now = clamp01(m.now);
          const was = clamp01(m.now - m.move);
          const lo = Math.min(was, now);
          const hi = Math.max(was, now);

          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => router.push("/market/" + encodeURIComponent(m.id))}
                className="grid w-full grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 py-3 text-left transition-colors hover:bg-white/[0.03] sm:grid-cols-[minmax(0,15rem)_1fr_auto]"
                title={`${m.title}\n${pctLabel(was)} -> ${pctLabel(now)} (${ppLabel(m.move)})`}
              >
                {/* Title */}
                <span className="truncate text-[13px] text-[var(--text)]">{truncate(m.title)}</span>

                {/* Dumbbell track */}
                <span className="relative block h-5 w-full" aria-hidden="true">
                  {/* baseline */}
                  <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />
                  {/* 50% contested marker */}
                  <span className="absolute top-0 h-full w-px bg-white/10" style={{ left: "50%" }} />
                  {/* connecting segment */}
                  <span
                    className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                    style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, background: colour }}
                  />
                  {/* was dot (hollow) */}
                  <span
                    className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--bg)]"
                    style={{ left: `${was * 100}%`, borderColor: colour }}
                  />
                  {/* now dot (solid, ringed against surface) */}
                  <span
                    className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--bg)]"
                    style={{ left: `${now * 100}%`, background: colour }}
                  />
                </span>

                {/* Numbers */}
                <span className="flex items-center gap-2 justify-self-start text-xs tabular-nums sm:justify-self-end">
                  <span className="text-muted">{pctLabel(was)}</span>
                  <span className="text-[var(--muted-dim)]">-&gt;</span>
                  <span className="text-[var(--text)]">{pctLabel(now)}</span>
                  <span className="w-[52px] text-right font-medium" style={{ color: colour }}>
                    {ppLabel(m.move)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
