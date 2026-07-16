import { pct, fmtVol, daysTo } from "@/lib/format";
import type { Market } from "@/lib/types";

export function BoardTable({ markets, moves }: { markets: Market[]; moves: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr>
          <th scope="col" className="py-2">Market</th>
          <th scope="col"><abbr title="Probability" className="no-underline">Prob</abbr></th>
          <th scope="col"><abbr title="Change since last refresh" className="no-underline">Δ</abbr></th>
          <th scope="col">Vol</th>
          <th scope="col">Resolves</th>
          <th scope="col">Platform</th>
        </tr>
      </thead>
      <tbody>
        {markets.map((m) => {
          const mv = moves[m.id];
          const d = daysTo(m.endDate);
          return (
            <tr key={m.id} className="border-t border-white/[0.06]">
              <td className="py-2 pr-3">{m.title.slice(0, 90)}</td>
              <td className="font-semibold tabular-nums text-[var(--text)]">{pct(m.prob)}</td>
              <td className="tabular-nums" style={{ color: mv == null ? "#888" : mv >= 0 ? "#3fb27f" : "#e0714f" }}>
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
