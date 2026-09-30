// GET /api/verify/:receiptHash?agentId=
// The five checks, run on the server against Monad. Convenience only: the
// same checks run in the browser on the profile, and anyone can run them.
import { NextResponse } from "next/server";
import { getStamp } from "@/lib/store";
import { apiHeaders, verifyStored } from "@/lib/api";

export async function GET(req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return NextResponse.json({ error: "receiptHash must be 32 bytes hex" }, { status: 400 });
  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId || !/^\d+$/.test(agentId)) return NextResponse.json({ error: "agentId query parameter required" }, { status: 400 });
  const stored = await getStamp(agentId, hash);
  if (!stored) return NextResponse.json({ error: "no stored receipt for this hash" }, { status: 404 });
  const result = await verifyStored(stored);
  return NextResponse.json(
    { ...result, note: "Kleos does not decide whether a record is valid; these checks read Monad. Run them yourself with the kleos package." },
    { headers: { ...apiHeaders, "cache-control": "no-store" } },
  );
}
