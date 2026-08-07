import { ImageResponse } from "next/og";

// Site-wide social-share card (homepage + any route without its own image).
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Crowdwise - the crowd's odds on macro events";

const BG = "#0e1117";
const TEXT = "#fafafa";
const MUTED = "#9aa4b2";
const ACCENT = "#4c9be8";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", background: BG, color: TEXT, padding: "72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
          <div style={{ width: 26, height: 26, borderRadius: 26, background: ACCENT, marginRight: 18 }} />
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: -0.5 }}>Crowdwise</div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, maxWidth: 1000 }}>The crowd&apos;s odds on macro events</div>
        <div style={{ fontSize: 30, color: MUTED, marginTop: 28 }}>Live implied probabilities from the Kalshi &amp; Polymarket prediction markets - the Fed path, recession, inflation, oil.</div>
      </div>
    ),
    { ...size },
  );
}
