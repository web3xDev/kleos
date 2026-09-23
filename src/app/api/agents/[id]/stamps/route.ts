// GET /api/agents/:id/stamps?limit=50&offset=0
// Public receipts (no bodies) for an agent, newest first.
import { NextResponse } from "next/server";

import { listAnchoredStamps, apiHeaders, stampPublic } from "@/lib/api";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "agent id must be an integer" }, { status: 400 });
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const stamps = await listAnchoredStamps(id);
  return NextResponse.json(
    { agentId: id, total: stamps.length, stamps: stamps.slice(offset, offset + limit).map(stampPublic) },
    { headers: apiHeaders },
  );
}
