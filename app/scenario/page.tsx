import { ScenarioBuilder } from "@/components/ScenarioBuilder";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;

export default async function ScenarioPage() {
  const markets = await fetchTopMarkets();
  return <ScenarioBuilder markets={markets} />;
}
