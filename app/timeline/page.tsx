import { TimelineView } from "@/components/TimelineView";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";
import type { Market } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  let markets: Market[] | undefined;
  try { markets = (await boardStore.readBoard())?.markets; } catch { /* fall through */ }
  if (!markets) markets = await fetchTopMarkets();
  return <TimelineView markets={markets} />;
}
