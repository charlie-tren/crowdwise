import type { Metadata } from "next";
import { TimelineView } from "@/components/TimelineView";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = {
  title: "Timeline - Crowdwise",
  // Paired with the lede in components/TimelineView.tsx - keep identical.
  description:
    "Term structure of priced macro risk: every market laid out by when it resolves, carrying its implied probability.",
  alternates: { canonical: "/timeline" },
};

export default async function TimelinePage() {
  const markets = await fetchTopMarkets();
  return <TimelineView markets={markets} />;
}
