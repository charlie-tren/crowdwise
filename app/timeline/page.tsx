import { TimelineView } from "@/components/TimelineView";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;

export default async function TimelinePage() {
  const markets = await fetchTopMarkets();
  return <TimelineView markets={markets} />;
}
