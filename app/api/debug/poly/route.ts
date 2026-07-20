import { NextResponse } from "next/server";

// TEMPORARY debug endpoint (remove after Polymarket macro-ingestion is wired).
// Reaches Polymarket's Gamma API from the Vercel server (the API is blocked on
// local/AU networks), so we can discover macro tag IDs + confirm response shapes
// by curling the deployed URL.
export const dynamic = "force-dynamic";

const GAMMA = "https://gamma-api.polymarket.com";
const MACRO_KW = /fed|rate|interest|inflation|recession|econom|gdp|cpi|jobs|payroll|unemploy|oil|tariff|pce/i;

async function j(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "macro-signals-web/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tagId = searchParams.get("tag_id");

  try {
    if (tagId) {
      const data = await j(`${GAMMA}/markets?tag_id=${tagId}&active=true&closed=false&limit=40&order=volumeNum&ascending=false`);
      const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.markets ?? [];
      return NextResponse.json({
        tag_id: tagId,
        count: items.length,
        rawFirst: items[0] ?? null,
        markets: items.map((m) => ({
          question: m.question ?? m.title,
          slug: m.slug,
          volumeNum: m.volumeNum ?? m.volume,
          outcomePrices: m.outcomePrices,
          endDate: m.endDate,
          closed: m.closed,
          active: m.active,
        })),
      });
    }

    // Default: paginate all tags, flag the macro-looking ones.
    const all: Array<{ id: string; label: string; slug: string }> = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const data = await j(`${GAMMA}/tags?limit=100&offset=${offset}`);
      const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.tags ?? [];
      if (!items.length) break;
      all.push(...items.map((t) => ({ id: t.id, label: t.label, slug: t.slug })));
      if (items.length < 100) break;
    }
    const macro = all.filter((t) => MACRO_KW.test(`${t.label ?? ""} ${t.slug ?? ""}`));
    return NextResponse.json({
      totalTags: all.length,
      macroTags: macro,
      allLabels: all.map((t) => `${t.id}:${t.label}`),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
