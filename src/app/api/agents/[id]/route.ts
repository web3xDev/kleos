// GET /api/agents/:id
// Identity, runtime, track record and the latest public receipts. No score.
import { NextResponse } from "next/server";
import { loadAgent } from "@/lib/agents";
import { listStamps } from "@/lib/store";
import { apiHeaders, publicClient, stampPublic, trackRecordOf } from "@/lib/api";
import { addresses, chain } from "@/lib/chain";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "agent id must be an integer" }, { status: 400 });
  const agent = await loadAgent(publicClient, BigInt(id)).catch(() => null);
  if (!agent) return NextResponse.json({ error: "no such agent" }, { status: 404 });
  const stamps = await listStamps(id);
  return NextResponse.json(
    {
      network: { name: chain.name, chainId: chain.id },
      agent: {
        id,
        name: agent.name,
        owner: agent.owner,
        runtime: agent.wallet,
        encryptionKey: agent.encryptionKey,
        registry: addresses.identityRegistry,
        profile: `/a/${id}`,
      },
      trackRecord: trackRecordOf(stamps),
      latestStamps: stamps.slice(0, 10).map(stampPublic),
      stamps: `/api/agents/${id}/stamps`,
      note: "Numbers are computed from stamps anchored in KleosStamps next to x402 settlements on Monad. Verify any stamp at /api/verify/{receiptHash}?agentId= or in your own client.",
    },
    { headers: apiHeaders },
  );
}
