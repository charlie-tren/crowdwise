import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · Crowdwise",
  // Paired with the lede on this page - keep identical.
  description:
    "Crowdwise shows live prediction-market probabilities across macro themes, pulled from the Kalshi and Polymarket public APIs and refreshed about every 10 minutes.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="max-w-none">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">About</h1>
      <p className="mt-2 text-sm text-muted">
        Crowdwise shows live prediction-market probabilities across macro themes, pulled from the
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
      <p className="mt-6 text-xs text-muted">
        For information only. This is not financial advice, and prediction-market prices are not forecasts or recommendations.
      </p>
    </article>
  );
}
