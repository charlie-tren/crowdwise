import type { Metadata } from "next";
import { CrossVenueView } from "@/components/CrossVenueView";
import { getBuildBoard } from "@/lib/buildBoard";
import { findCrossVenue } from "@/lib/crossVenue";

export const metadata: Metadata = {
  title: "Kalshi vs Polymarket - Crowdwise",
  // Paired with the lede in components/CrossVenueView.tsx - keep identical.
  description:
    "Where both venues price the exact same outcome, side by side. The gap is how far the two venues disagree.",
  alternates: { canonical: "/cross-venue" },
};

export default async function CrossVenuePage() {
  const { markets } = await getBuildBoard();
  const pairs = findCrossVenue(markets);
  return <CrossVenueView pairs={pairs} />;
}
