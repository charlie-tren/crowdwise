"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ProbTimeline } from "./charts/ProbTimeline";
import { ProbBadge } from "./ProbBadge";
import { MarketCard } from "./MarketCard";
import { fmtVol, daysTo } from "@/lib/format";
import { displayTitle } from "@/lib/highlights";
import type { Market, HistoryPoint } from "@/lib/types";

export function MarketDetail({ m, related }: { m: Market; related?: Market[] }) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [lookback, setLookback] = useState(90);

  useEffect(() => {
    let url: string | null = null;
    if (m.platform === "Kalshi" && m.series) {
      url = `/api/history/${encodeURIComponent(m.series)}/${encodeURIComponent(m.id)}?days=${lookback}&interval=1440`;
    } else if (m.platform === "Polymarket" && m.clobTokenId) {
      // full available history (markets are often only days old, so a fixed day
      // window predating the first trade returns nothing); hourly resolution.
      url = `/api/poly-history/${encodeURIComponent(m.clobTokenId)}?interval=max&fidelity=60`;
    }
    if (!url) { setPoints([]); return; }
    setPoints(null);
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setPoints(d.points ?? []); })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [m.id, m.series, m.platform, m.clobTokenId, lookback]);

  const d = daysTo(m.endDate);
  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-xs text-muted hover:text-[var(--text)]">
        ← Back to board
      </Link>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{displayTitle(m)}</h1>
        <ProbBadge prob={m.prob} showMeter className="text-[40px]" />
      </div>
      <div className="mb-6 flex flex-wrap gap-4 text-[13px] text-muted">
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
      {related?.length ? (
        <div className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">More in {m.category}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <MarketCard key={r.id} m={r} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
