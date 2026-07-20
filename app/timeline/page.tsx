import type { Metadata } from "next";
import { TimelineView } from "@/components/TimelineView";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = { title: "Timeline · Crowdwise" };

export default async function TimelinePage() {
  const markets = await fetchTopMarkets();
  return <TimelineView markets={markets} />;
}
