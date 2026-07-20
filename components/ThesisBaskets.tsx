import Link from "next/link";
import { pct } from "@/lib/format";
import { resolveTheses } from "@/lib/thesis";
import type { Market } from "@/lib/types";

export function ThesisBaskets({ markets }: { markets: Market[] }) {
  const theses = resolveTheses(markets).filter((t) => t.resolvedCount > 0);
  if (!theses.length) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-medium">Thesis baskets</h2>
      <p className="mb-4 text-sm text-muted">
        Named macro views, each a basket of live markets. Combined odds are the joint probability of every leg
        resolving as stated - independence assumed, so treat as a bound, not gospel.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {theses.map((t) => (
          <div key={t.key} className="flex flex-col rounded-2xl border border-white/[0.06] bg-panel/60 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-[var(--text)]">{t.name}</h3>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums text-accent">{pct(t.jointProb, 0)}</div>
                <div className="text-[11px] text-muted">combined</div>
              </div>
            </div>
            <p className="mt-1 text-[13px] text-muted">{t.summary}</p>
            <ul className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
              {t.legs.map((leg, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px]">
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[11px] font-medium " +
                      (leg.side === "yes" ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-muted")
                    }
                  >
                    {leg.side.toUpperCase()}
                  </span>
                  <span className="flex-1 text-muted">{leg.label}</span>
                  {leg.market && leg.prob != null ? (
                    <Link
                      href={`/market/${encodeURIComponent(leg.market.id)}`}
                      className="tabular-nums text-[var(--text)] hover:text-accent"
                      title={leg.market.title}
                    >
                      {pct(leg.prob, 0)}
                    </Link>
                  ) : (
                    <span className="text-[var(--muted-dim)]">no market</span>
                  )}
                </li>
              ))}
            </ul>
            {t.resolvedCount < t.totalLegs && (
              <p className="mt-2 text-[11px] text-[var(--muted-dim)]">
                Partial - {t.resolvedCount} of {t.totalLegs} legs have a live market.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
