import type { MetadataRoute } from "next";
import { fetchTopMarkets, representativeByEvent } from "@/lib/board";
import { SITE_URL } from "@/lib/site";

// Regenerate daily. The market set moves slowly and a sitemap is a discovery
// hint, not a live feed.
export const revalidate = 86_400;

// How many market pages to list. Deliberately capped, and NOT set to the ~600
// markets on the board: those pages are templated and near-identical, and
// publishing several hundred of them reads as scaled auto-generated content,
// which risks the whole subdomain rather than merely failing to rank. This cap
// keeps the sitemap to roughly the set already linked from the board on `/` and
// `/value`, so it makes existing pages reliably discoverable instead of
// advertising a long tail of thin ones.
const MARKET_LIMIT = 100;

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "", priority: 1.0, changeFrequency: "hourly" },
  { path: "/map", priority: 0.8, changeFrequency: "hourly" },
  { path: "/timeline", priority: 0.8, changeFrequency: "hourly" },
  { path: "/cross-venue", priority: 0.8, changeFrequency: "hourly" },
  { path: "/value", priority: 0.7, changeFrequency: "hourly" },
  { path: "/scenario", priority: 0.6, changeFrequency: "daily" },
  { path: "/about", priority: 0.3, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Best-effort: the venues rate-limit, and a sitemap that fails the build over
  // a 429 would be worse than one carrying only the static routes.
  try {
    const markets = representativeByEvent(await fetchTopMarkets())
      .filter((m) => m.prob != null && m.volume > 0)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, MARKET_LIMIT);

    for (const m of markets) {
      routes.push({
        url: `${SITE_URL}/market/${encodeURIComponent(m.id)}`,
        lastModified: now,
        changeFrequency: "hourly",
        priority: 0.5,
      });
    }
  } catch (err) {
    console.warn("sitemap: market fetch failed, serving static routes only", err);
  }

  return routes;
}
