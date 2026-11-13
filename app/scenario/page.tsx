import type { Metadata } from "next";
import { ScenarioMap } from "@/components/scenarioMap/ScenarioMap";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 900;
export const maxDuration = 60;
export const metadata: Metadata = {
  title: "Scenario Map - Crowdwise",
  // The page carries no standfirst: this sentence exists for a share card, where
  // a reader arriving cold needs it, and nobody on the page has to read it.
  description:
    "Build a macro view as a map: live market prices, your own estimates, and the formulas that combine them.",
  alternates: { canonical: "/scenario" },
};

export default async function ScenarioPage() {
  const markets = await fetchTopMarkets();
  return <ScenarioMap markets={markets} />;
}
