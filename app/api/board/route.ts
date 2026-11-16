import { NextResponse } from "next/server";
import { getBuildBoard } from "@/lib/buildBoard";

export const dynamic = "force-static";

export async function GET() {
  const { markets, builtAt } = await getBuildBoard();
  return NextResponse.json({ markets, moves: {}, fetchedAt: builtAt });
}
