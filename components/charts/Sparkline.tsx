// Tiny inline 7-day trend line for a market card. Direction-coloured to match the
// card's existing move-pp indicator (green up / red down); flat stays neutral.
export function Sparkline({ values, width = 58, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 1.5;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - 2 * pad);
      const y = pad + (1 - (v - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const delta = values[values.length - 1] - values[0];
  const stroke = Math.abs(delta) < 0.005 ? "#9aa4b2" : delta > 0 ? "#3fb27f" : "#e0714f";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
