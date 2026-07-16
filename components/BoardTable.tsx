import { pct, fmtVol, probColor, daysTo } from "@/lib/format";
import type { Market } from "@/lib/types";

export function BoardTable({ markets, moves }: { markets: Market[]; moves: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr><th className="py-2">Market</th><th>P</th><th>Δ</th><th>Vol</th><th>Resolves</th><th>Platform</th></tr>
      </thead>
      <tbody>
        {markets.map((m) => {
          const mv = moves[m.id];
          const d = daysTo(m.endDate);
          return (
            <tr key={m.id} className="border-t border-white/5">
              <td className="py-2 pr-3">{m.title.slice(0, 90)}</td>
              <td style={{ color: probColor(m.prob) }} className="font-bold tabular-nums">{pct(m.prob)}</td>
              <td className="tabular-nums" style={{ color: mv == null ? "#888" : mv >= 0 ? "#22c55e" : "#ef4444" }}>
                {mv == null ? "—" : `${mv >= 0 ? "+" : ""}${(mv * 100).toFixed(1)}pp`}
              </td>
              <td>{fmtVol(m.volume)}</td>
              <td>{d != null && d >= 0 ? `${m.endDate} (${d}d)` : m.endDate || "—"}</td>
              <td>{m.platform}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
