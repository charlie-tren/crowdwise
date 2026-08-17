import { ImageResponse } from "next/og";
import { fetchTopMarkets } from "@/lib/board";
import { fetchMarketById } from "@/lib/sources";
import { displayTitle } from "@/lib/highlights";
import { THEME_COLOURS } from "@/lib/themeColours";
import { probFill } from "@/lib/format";

// Per-market social-share card: the image that unfurls when a market link is
// pasted into X / Slack / LinkedIn etc. Every shared link becomes a branded,
// odds-carrying advert. Cached like the board so unfurl bots don't hammer the
// upstream APIs. Best-effort: falls back to a generic card if the market is gone.
export const runtime = "nodejs";
export const revalidate = 600;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Crowdwise - live crowd odds on a macro event";

const BG = "#0e1117";
const TEXT = "#fafafa";
const MUTED = "#9aa4b2";
const ACCENT = "#4c9be8";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  let market = null;
  try {
    // Same by-id fallback as the page: the top-set shifts between requests, so
    // don't serve the generic card for a market that really exists.
    market = (await fetchTopMarkets()).find((x) => x.id === id) ?? (await fetchMarketById(id));
  } catch {
    /* fall back to the generic card */
  }

  const title = market ? displayTitle(market) : "Live odds on the Fed, inflation, recession and oil";
  const prob = market?.prob ?? null;
  const colour = market ? THEME_COLOURS[market.category] ?? ACCENT : ACCENT;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: BG, color: TEXT, padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: 22, background: ACCENT, marginRight: 16 }} />
            <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.5 }}>Crowdwise</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 24, color: MUTED }}>{market ? market.platform : "Kalshi · Polymarket"}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {market ? (
            <div style={{ display: "flex", marginBottom: 28 }}>
              <div style={{ fontSize: 26, color: colour, background: `${colour}22`, padding: "8px 20px", borderRadius: 10 }}>{market.category}</div>
            </div>
          ) : null}
          <div style={{ fontSize: 66, fontWeight: 600, lineHeight: 1.12, letterSpacing: -1.5, maxWidth: 1010 }}>{title}</div>
          {prob != null ? (
            <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
              <div style={{ fontSize: 128, fontWeight: 700, letterSpacing: -3, marginRight: 40 }}>{`${Math.round(prob * 100)}%`}</div>
              <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                <div style={{ display: "flex", width: "100%", height: 24, borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", width: `${Math.round(prob * 100)}%`, height: "100%", borderRadius: 12, background: probFill(prob) }} />
                </div>
                <div style={{ fontSize: 24, color: MUTED, marginTop: 12 }}>implied probability</div>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ fontSize: 24, color: MUTED }}>crowdwise-live.vercel.app · prediction-market odds on macro events</div>
      </div>
    ),
    { ...size },
  );
}
