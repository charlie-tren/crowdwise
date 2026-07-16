export function fmtVol(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return `${Math.round(v)}`;
}

export function daysTo(endDate: string): number | null {
  const d = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t0) / 86_400_000);
}

export function pct(p: number | null, decimals = 1): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(decimals)}%`;
}

export function probColor(p: number | null): string {
  if (p == null) return "#888888";
  if (p < 0.25) return "#22c55e";
  if (p < 0.50) return "#eab308";
  if (p < 0.75) return "#f97316";
  return "#ef4444";
}
