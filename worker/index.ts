// Runs only for requests no static file matches: price-history and market
// lookups proxied to Kalshi / Polymarket, the shell for a market not built, and
// the 404 page. Everything else is a static asset and never reaches this code.
import { fetchKalshiMarketHistory, fetchMarketById, fetchPolymarketMarketHistory } from "../lib/sources";
import { FALLBACK_ID, marketIdFromPath } from "../lib/marketFallback";
import type { Market } from "../lib/types";

interface Env { ASSETS: { fetch(input: Request | string): Promise<Response> } }
interface Ctx { waitUntil(p: Promise<unknown>): void }

const TTL = 300;
const edge = () => (caches as unknown as { default: Cache }).default;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TTL}` },
  });
}

async function cached(url: string, ctx: Ctx, make: () => Promise<Response>): Promise<Response> {
  const key = new Request(url);
  const hit = await edge().match(key);
  if (hit) return hit;
  const res = await make();
  if (res.ok) ctx.waitUntil(edge().put(key, res.clone()));
  return res;
}

function marketJson(origin: string, id: string, ctx: Ctx): Promise<Response> {
  return cached(`${origin}/api/market/${encodeURIComponent(id)}`, ctx, async () => {
    const market = await fetchMarketById(id);
    return json({ market }, market ? 200 : 404);
  });
}

async function notFound(env: Env, origin: string): Promise<Response> {
  const page = await env.ASSETS.fetch(`${origin}/404.html`);
  return new Response(page.body, { status: 404, headers: page.headers });
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    const { origin, pathname: p, searchParams: q } = url;
    let m: RegExpExecArray | null;

    if ((m = /^\/api\/history\/([^/]+)\/([^/]+)$/.exec(p))) {
      const [series, ticker] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
      const days = Number(q.get("days") ?? 90);
      const interval = Number(q.get("interval") ?? 1440);
      return cached(url.toString(), ctx, async () =>
        json({ points: await fetchKalshiMarketHistory(series, ticker, { days, periodInterval: interval }) }));
    }

    if ((m = /^\/api\/poly-history\/([^/]+)$/.exec(p))) {
      const token = decodeURIComponent(m[1]);
      // interval=max returns the market's full history regardless of age; an explicit
      // start/end window that predates the first trade makes the CLOB return nothing.
      const interval = q.get("interval") ?? "max";
      const fidelity = Number(q.get("fidelity") ?? 60);
      return cached(url.toString(), ctx, async () =>
        json({ points: await fetchPolymarketMarketHistory(token, { interval, fidelity }) }));
    }

    if ((m = /^\/api\/market\/([^/]+)$/.exec(p))) {
      return marketJson(origin, decodeURIComponent(m[1]), ctx);
    }

    // A market page that was not built: serve the shell if the market exists.
    // RSC payloads (.txt) 404 so the client router falls back to a full page load.
    const id = p.endsWith(".txt") ? null : marketIdFromPath(p);
    if (id && id !== FALLBACK_ID) {
      const found = (await (await marketJson(origin, id, ctx)).json()) as { market: Market | null };
      if (found.market) {
        const shell = await env.ASSETS.fetch(`${origin}/market/${FALLBACK_ID}`);
        return new Response(shell.body, { status: 200, headers: shell.headers });
      }
    }

    return notFound(env, origin);
  },
};
