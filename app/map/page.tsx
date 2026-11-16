import type { Metadata } from "next";
import { MarketMapView } from "@/components/MarketMapView";
import { getBuildBoard } from "@/lib/buildBoard";

export const metadata: Metadata = {
  title: "Market Map - Crowdwise",
  // Paired with the lede in components/MarketMapView.tsx - keep identical.
  description:
    "Two views of where volume and conviction sit across the board - biggest markets by size, and where the crowd is genuinely undecided.",
  alternates: { canonical: "/map" },
};

export default async function MarketMapPage() {
  const { markets } = await getBuildBoard();
  return <MarketMapView markets={markets} />;
}
