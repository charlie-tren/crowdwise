import type { Metadata } from "next";
import { ScenarioBuilder } from "@/components/ScenarioBuilder";
import { ThesisBaskets } from "@/components/ThesisBaskets";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = {
  title: "Scenario Builder · Crowdwise",
  // Paired with the lede in components/ScenarioBuilder.tsx - keep identical.
  description:
    "Pick two or more markets to read the joint probability of all resolving YES, and of at least one.",
  alternates: { canonical: "/scenario" },
};

export default async function ScenarioPage() {
  const markets = await fetchTopMarkets();
  return (
    <>
      <ThesisBaskets markets={markets} />
      <ScenarioBuilder markets={markets} />
    </>
  );
}
