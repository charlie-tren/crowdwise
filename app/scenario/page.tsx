import type { Metadata } from "next";
import { ScenarioBuilder } from "@/components/ScenarioBuilder";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = { title: "Scenario Builder · Crowdwise" };

export default async function ScenarioPage() {
  const markets = await fetchTopMarkets();
  return <ScenarioBuilder markets={markets} />;
}
