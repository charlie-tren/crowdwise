"use client";
import { useRouter } from "next/navigation";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { probFill } from "@/lib/format";
import type { TreemapNode } from "@/lib/mapData";

interface ContentProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; prob?: number; id?: string;
  onLeafClick?: (id: string) => void;
}

function TreemapCell(props: ContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", prob, id, onLeafClick } = props;
  // Leaf/market nodes carry `prob`; category (parent) nodes don't. Testing on
  // `prob != null` is robust regardless of how Recharts numbers `depth` for a
  // 2-level (category -> market) tree.
  const isLeaf = prob != null;
  const fill = isLeaf ? probFill(prob as number) : "#161a23";
  // Round to integer device pixels - fractional SVG coords render blurry text.
  const rx = Math.round(x), ry = Math.round(y), rw = Math.round(width), rh = Math.round(height);
  const big = rw > 54 && rh > 24;
  const maxChars = Math.max(6, Math.floor(rw / 7.5));
  const label = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
  return (
    <g>
      <rect
        x={rx} y={ry} width={rw} height={rh}
        fill={fill}
        stroke="#0e1117"
        strokeWidth={isLeaf ? 1 : 2}
        style={isLeaf ? { cursor: "pointer" } : undefined}
        onClick={isLeaf && id ? () => onLeafClick?.(id) : undefined}
      />
      {isLeaf && big && (
        // White text with a dark outline (paintOrder stroke) stays legible on any
        // tile colour across the gradient - fixes the low-contrast/blurry labels.
        <text
          x={rx + 8}
          y={ry + 18}
          fontSize={12}
          fontWeight={600}
          fill="#ffffff"
          stroke="#0b0e17"
          strokeWidth={3}
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ pointerEvents: "none" }}
        >
          {label}
          {rh > 40 && (
            <tspan x={rx + 8} dy={16} fontWeight={500} fillOpacity={0.9}>
              {`${((prob as number) * 100).toFixed(0)}%`}
            </tspan>
          )}
        </text>
      )}
      {!isLeaf && rw > 40 && (
        <text
          x={rx + 8}
          y={ry + 16}
          fontSize={11}
          fontWeight={700}
          letterSpacing="0.05em"
          fill="#9aa4b2"
          style={{ pointerEvents: "none", textTransform: "uppercase" }}
        >
          {name.toUpperCase()}
        </text>
      )}
    </g>
  );
}

export function MarketTreemap({ data }: { data: TreemapNode[] }) {
  const router = useRouter();
  if (!data.length) return <p className="text-sm text-muted">No markets to map.</p>;
  const onLeafClick = (id: string) => router.push("/market/" + encodeURIComponent(id));
  return (
    <div
      role="img"
      aria-label="Treemap of markets by theme, tile size by trading volume, tile colour by implied probability"
    >
      <ResponsiveContainer width="100%" height={520}>
        <Treemap
          data={data as unknown as Record<string, unknown>[]}
          dataKey="size"
          nameKey="name"
          stroke="#0e1117"
          content={<TreemapCell onLeafClick={onLeafClick} />}
          isAnimationActive={false}
        >
          <Tooltip
            contentStyle={{ background: "#0e1117", border: "1px solid #1e2130", color: "#fafafa" }}
            formatter={(value, _name, item) => {
              const payload = (item?.payload ?? {}) as { title?: string; name?: string; prob?: number };
              const label = payload.title ?? payload.name ?? "";
              if (payload.prob != null) return [`${(payload.prob * 100).toFixed(0)}%`, label];
              return [value, label];
            }}
            labelFormatter={() => ""}
          />
        </Treemap>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-muted">Tile brightness = implied probability.</p>
    </div>
  );
}
