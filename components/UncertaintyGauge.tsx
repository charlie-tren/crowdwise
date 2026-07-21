"use client";
import { uncertaintyIndex } from "@/lib/uncertainty";
import { probFill } from "@/lib/format";
import type { Market } from "@/lib/types";

export function UncertaintyGauge({ markets }: { markets: Market[] }) {
  const { index, count } = uncertaintyIndex(markets);
  const pctVal = Math.round(index * 100);
  const fill = probFill(index);

  return (
    <div
      role="img"
      aria-label={`Market uncertainty index: ${pctVal}% - volume-weighted share of trading weight sitting near 50/50 across ${count} markets`}
      className="mb-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-panel p-4 sm:flex-row sm:items-center sm:gap-5"
    >
      <div className="flex items-baseline gap-2 sm:min-w-[132px]">
        <span className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[var(--text)]">
          {pctVal}
        </span>
        <span className="text-lg font-medium text-muted">%</span>
      </div>

      <div className="flex-1">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text)]">Market uncertainty</span>
          <span className="text-xs tabular-nums text-[var(--muted-dim)]">{count} markets</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="transition-prob h-full rounded-full"
            style={{ width: `${pctVal}%`, background: fill }}
          />
        </div>
        <p className="mt-2 text-xs leading-snug text-muted">
          How contested the board is - share of trading weight sitting near 50/50. Higher means the
          crowd is genuinely undecided across the markets that matter.
        </p>
      </div>
    </div>
  );
}
