import { NextResponse } from "next/server";
import { getBuildBoard } from "@/lib/buildBoard";

// Read back by the next build, which keeps pages for markets that left the board.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json((await getBuildBoard()).seen);
}
