"use client";
import { useEffect, useState } from "react";
import { ProbTimeline } from "./charts/ProbTimeline";
import { ProbBadge } from "./ProbBadge";
import { fmtVol, daysTo } from "@/lib/format";
import type { Market, HistoryPoint } from "@/lib/types";

export function MarketDetail({ m }: { m: Market }) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [lookback, setLookback] = useState(90);

  useEffect(() => {
    if (m.platform !== "Kalshi" || !m.series) { setPoints([]); return; }
    setPoints(null);
    fetch(`/api/history/${encodeURIComponent(m.series)}/${encodeURIComponent(m.id)}?days=${lookback}&interval=1440`)
      .then((r) => r.json()).then((d) => setPoints(d.points ?? [])).catch(() => setPoints([]));
  }, [m.id, m.series, m.platform, lookback]);

  const d = daysTo(m.endDate);
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">{m.title}</h1>
        <ProbBadge prob={m.prob} className="text-3xl" />
      </div>
      <div className="mb-6 flex flex-wrap gap-4 text-sm text-muted">
        <span>{m.category}</span><span>{m.platform}</span>
        <span>Vol {fmtVol(m.volume)}</span>
        <span>Resolves {m.endDate || "—"}{d != null && d >= 0 ? ` (${d}d)` : ""}</span>
      </div>
      {m.platform === "Kalshi" && m.series && (
        <div className="mb-3 flex gap-2">
          {[30, 90, 180].map((n) => (
            <button key={n} onClick={() => setLookback(n)}
              className={`rounded px-2 py-1 text-xs ${lookback === n ? "bg-accent/20 text-[var(--text)]" : "text-muted"}`}>
              {n}d
            </button>
          ))}
        </div>
      )}
      {points === null ? <p className="text-sm text-muted">Loading history…</p> : <ProbTimeline points={points} />}
    </div>
  );
}
