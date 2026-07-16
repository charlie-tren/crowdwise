import { KALSHI_MACRO_SERIES } from "@/lib/taxonomy";

export default function AboutPage() {
  const series = Object.entries(KALSHI_MACRO_SERIES).sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]));
  return (
    <article className="max-w-none">
      <h1 className="text-2xl font-semibold">About</h1>
      <p className="mt-2 text-sm text-muted">
        Macro Signals shows live prediction-market probabilities across macro themes, pulled from the
        Kalshi and Polymarket public APIs and refreshed about every 10 minutes.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Data sources</h2>
      <ul className="mt-2 list-disc pl-5 text-sm text-muted">
        <li><strong className="text-[var(--text)]">Kalshi</strong> - queried by a curated allowlist of macro series (stable; the markets inside churn). Covers rates / inflation / growth / commodities.</li>
        <li><strong className="text-[var(--text)]">Polymarket</strong> - top markets by volume, keyword-tagged. Covers elections / geopolitics.</li>
      </ul>
      <p className="mt-2 text-sm text-muted">
        Volume units differ across platforms (Kalshi = contracts, Polymarket = USD), so compare within a theme, not across.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Curated Kalshi series</h2>
      <table className="mt-2 text-sm text-muted">
        <thead><tr><th className="pr-6 text-left">Series</th><th className="text-left">Theme</th></tr></thead>
        <tbody>{series.map(([s, t]) => <tr key={s}><td className="pr-6">{s}</td><td>{t}</td></tr>)}</tbody>
      </table>
      <p className="mt-6 text-xs text-muted">
        For information only. This is not financial advice, and prediction-market prices are not forecasts or recommendations.
      </p>
    </article>
  );
}
