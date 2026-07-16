"use client";
import { ResponsiveContainer, Treemap } from "recharts";
import { probColor } from "@/lib/format";
import type { TreemapNode } from "@/lib/mapData";

interface ContentProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; prob?: number; depth?: number;
}

function TreemapCell(props: ContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", prob, depth = 0 } = props;
  const isLeaf = depth === 1 && prob != null;
  const fill = isLeaf ? probColor(prob as number) : "#141826";
  const big = width > 60 && height > 28;
  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill={fill}
        stroke="#0e1117"
        strokeWidth={isLeaf ? 1 : 2}
        fillOpacity={isLeaf ? 0.85 : 1}
      />
      {isLeaf && big && (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fill="#0e1117" fontWeight={600}>
            {name.length > width / 6 ? `${name.slice(0, Math.max(4, Math.floor(width / 6)))}…` : name}
          </text>
          <text x={x + 6} y={y + 30} fontSize={11} fill="#0e1117">
            {`${((prob as number) * 100).toFixed(0)}%`}
          </text>
        </>
      )}
      {!isLeaf && width > 40 && (
        <text x={x + 6} y={y + 16} fontSize={12} fill="#c9ccd6" fontWeight={600}>{name}</text>
      )}
    </g>
  );
}

export function MarketTreemap({ data }: { data: TreemapNode[] }) {
  if (!data.length) return <p className="text-sm text-muted">No markets to map.</p>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={520}>
        <Treemap
          data={data as unknown as Record<string, unknown>[]}
          dataKey="size"
          nameKey="name"
          stroke="#0e1117"
          content={<TreemapCell />}
          isAnimationActive={false}
        />
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-muted">Tile colour: green = low probability, red = high probability.</p>
    </div>
  );
}
