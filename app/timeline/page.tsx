import type { Metadata } from "next";
import { TimelineView } from "@/components/TimelineView";
import { getBuildBoard } from "@/lib/buildBoard";

export const metadata: Metadata = {
  title: "Timeline - Crowdwise",
  // Paired with the lede in components/TimelineView.tsx - keep identical.
  description:
    "Term structure of priced macro risk: every market laid out by when it resolves, carrying its implied probability.",
  alternates: { canonical: "/timeline" },
};

export default async function TimelinePage() {
  const { markets } = await getBuildBoard();
  return <TimelineView markets={markets} />;
}
