"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { probFill, pct, fmtVol } from "@/lib/format";
import { THEME_COLOURS } from "@/lib/themeColours";
import type { TreemapNode, TreemapLeaf } from "@/lib/mapData";
import { squarify, inset, type Placed, type Rect } from "./squarify";

// ---- layout constants (SVG user units; the whole board scales to container) --
const VB_W = 1000;
const VB_H = 660;
const GROUP_GAP = 6; // seam between theme panels
const TILE_GAP = 3; // seam between market tiles
const HEADER_H = 30; // theme header band height

interface PlacedTile {
  leaf: TreemapLeaf;
  theme: string;
  colour: string;
  rect: Rect; // integer-rounded, already inset for the seam
}

interface PlacedHeader {
  theme: string;
  colour: string;
  x: number;
  y: number;
  w: number;
}

function round(r: Rect): Rect {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y };
}

function buildLayout(data: TreemapNode[]) {
  const tiles: PlacedTile[] = [];
  const headers: PlacedHeader[] = [];

  const groups = data
    .map((n) => ({ node: n, value: n.children.reduce((a, c) => a + c.size, 0) }))
    .filter((g) => g.value > 0);

  const panels: Placed<TreemapNode>[] = squarify(
    groups.map((g) => ({ item: g.node, value: g.value })),
    { x: 0, y: 0, w: VB_W, h: VB_H },
  );

  for (const panel of panels) {
    const node = panel.item;
    const colour = THEME_COLOURS[node.name] ?? "#4c9be8";
    const box = inset(panel, GROUP_GAP / 2);
    const showHeader = box.h >= 60 && box.w >= 90;
    const headerH = showHeader ? Math.min(HEADER_H, box.h * 0.22) : 0;

    if (showHeader) {
      const r = round({ x: box.x, y: box.y, w: box.w, h: headerH });
      headers.push({ theme: node.name, colour, x: r.x, y: r.y, w: r.w });
    }

    const tilesRect: Rect = { x: box.x, y: box.y + headerH, w: box.w, h: box.h - headerH };
    const placed = squarify(
      node.children.map((c) => ({ item: c, value: c.size })),
      tilesRect,
    );
    for (const p of placed) {
      const r = round(inset(p, TILE_GAP / 2));
      if (r.w <= 0 || r.h <= 0) continue;
      tiles.push({ leaf: p.item, theme: node.name, colour, rect: r });
    }
  }

  return { tiles, headers };
}

interface HoverState {
  leaf: TreemapLeaf;
  theme: string;
  colour: string;
  xPct: number; // 0..1 across the svg, for tooltip positioning
  yPct: number;
}

export function MarketTreemap({ data }: { data: TreemapNode[] }) {
  const router = useRouter();
  const { tiles, headers } = useMemo(() => buildLayout(data), [data]);
  const [hover, setHover] = useState<HoverState | null>(null);

  if (!data.length || !tiles.length) return <p className="text-sm text-muted">No markets to map.</p>;

  const onLeafClick = (id: string) => router.push("/market/" + encodeURIComponent(id));

  // Legend gradient sampled straight off the shared blue probability ramp.
  const stops = [0, 0.25, 0.5, 0.75, 1].map((p) => probFill(p));
  const gradient = `linear-gradient(90deg, ${stops.join(", ")})`;

  const totalVol = tiles.reduce((a, t) => a + t.leaf.size, 0);

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0e15]">
      {/* Legend / key bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="inline-block h-3 w-3 rounded-[3px] border border-white/20" />
          <span>
            Tile size = <span className="text-[var(--text)]">volume</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted">Implied probability</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-muted">0%</span>
            <span
              className="h-2.5 w-32 rounded-full ring-1 ring-inset ring-white/10"
              style={{ background: gradient }}
              aria-hidden
            />
            <span className="text-[11px] tabular-nums text-muted">100%</span>
          </div>
        </div>
      </div>

      {/* The board */}
      <div
        className="relative"
        role="img"
        aria-label={`Treemap of the ${tiles.length} biggest markets by trading volume, grouped into ${headers.length || data.length} themes. Tile area is trading volume; tile colour is implied probability on a light-to-bright blue scale.`}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", height: "auto" }}
        >
          {/* theme header bands */}
          {headers.map((h) => (
            <g key={`h-${h.theme}`} style={{ pointerEvents: "none" }}>
              <rect x={h.x} y={h.y} width={h.w} height={HEADER_H} fill="#11151f" rx={3} />
              <rect x={h.x} y={h.y} width={4} height={HEADER_H} fill={h.colour} rx={2} />
              <text
                x={h.x + 12}
                y={h.y + HEADER_H / 2 + 1}
                dominantBaseline="middle"
                fontSize={13}
                fontWeight={700}
                letterSpacing="0.04em"
                fill="#e7ebf2"
                style={{ textTransform: "uppercase" }}
              >
                {h.theme}
              </text>
            </g>
          ))}

          {/* market tiles */}
          {tiles.map((t) => {
            const { rect: r, leaf } = t;
            const fill = probFill(leaf.prob);
            const showName = r.w >= 54 && r.h >= 22;
            const showProb = r.w >= 62 && r.h >= 42;
            const showVol = r.w >= 108 && r.h >= 60;
            const maxChars = Math.max(4, Math.floor(r.w / 8.2));
            const name = leaf.name.length > maxChars ? `${leaf.name.slice(0, maxChars - 1)}…` : leaf.name;
            const active = hover?.leaf.id === leaf.id;
            return (
              <g
                key={leaf.id}
                style={{ cursor: "pointer" }}
                onClick={() => onLeafClick(leaf.id)}
                onMouseMove={() =>
                  setHover({
                    leaf,
                    theme: t.theme,
                    colour: t.colour,
                    xPct: (r.x + r.w / 2) / VB_W,
                    yPct: r.y / VB_H,
                  })
                }
              >
                <title>{`${leaf.title} — ${pct(leaf.prob, 0)}`}</title>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={3}
                  fill={fill}
                  shapeRendering="crispEdges"
                  stroke={active ? "#ffffff" : "#0b0e15"}
                  strokeWidth={active ? 2 : 1}
                  strokeOpacity={active ? 0.9 : 1}
                />
                {showName && (
                  <text
                    x={r.x + 8}
                    y={r.y + 17}
                    fontSize={13}
                    fontWeight={650}
                    fill="#ffffff"
                    stroke="#0a0d14"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    style={{ pointerEvents: "none" }}
                  >
                    {name}
                    {showProb && (
                      <tspan x={r.x + 8} dy={17} fontSize={13} fontWeight={700} fillOpacity={0.95}>
                        {pct(leaf.prob, 0)}
                      </tspan>
                    )}
                    {showVol && (
                      <tspan x={r.x + 8} dy={15} fontSize={11} fontWeight={500} fillOpacity={0.8}>
                        {fmtVol(leaf.size)} vol
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* hover tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] -translate-x-1/2 rounded-lg border border-white/10 bg-[#0e1117]/95 px-3 py-2 shadow-xl backdrop-blur-sm"
            style={{
              left: `${hover.xPct * 100}%`,
              top: `calc(${hover.yPct * 100}% - 8px)`,
              transform: `translate(-50%, -100%)`,
            }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: hover.colour }} />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{hover.theme}</span>
            </div>
            <div className="mb-1.5 text-[13px] leading-snug text-[var(--text)]">{hover.leaf.title}</div>
            <div className="flex items-center justify-between gap-4 text-[12px] tabular-nums">
              <span className="text-muted">
                Prob <span className="text-accent">{pct(hover.leaf.prob, 0)}</span>
              </span>
              <span className="text-muted">
                Vol <span className="text-[var(--text)]">{fmtVol(hover.leaf.size)}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* source / footnote line */}
      <figcaption className="border-t border-white/[0.06] px-4 py-2.5 text-[11px] leading-relaxed text-muted">
        Top {tiles.length} markets by volume ({fmtVol(totalVol)} total) · volume mixes Kalshi contracts and
        Polymarket USD - compare within a theme, not across platforms. Source: Kalshi &amp; Polymarket.
      </figcaption>
    </figure>
  );
}
