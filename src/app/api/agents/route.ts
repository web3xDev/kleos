// GET /api/agents?withRecord=1&limit=50&offset=0
// Every ERC-8004 agent on Monad testnet with its Kleos stamp count.
import { NextResponse } from "next/server";
import { explore } from "@/lib/registry-scan";
import { apiHeaders } from "@/lib/api";
import { chain } from "@/lib/chain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const withRecord = url.searchParams.get("withRecord") === "1";
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const data = await explore();
  const all = data.agents.filter((a) => (withRecord ? a.stamps > 0 : true)).sort((a, b) => b.stamps - a.stamps || b.id - a.id);
  return NextResponse.json(
    {
      network: { name: chain.name, chainId: chain.id },
      total: all.length,
      registered: data.total,
      withTrackRecord: data.withTrackRecord,
      totalStamps: data.totalStamps,
      scannedAt: data.scannedAt,
      agents: all.slice(offset, offset + limit).map((a) => ({
        id: a.id,
        name: a.name,
        owner: a.owner,
        runtime: a.wallet,
        verifiedActions: a.stamps,
        registeredViaKleos: a.kleos,
        profile: `/a/${a.id}`,
      })),
    },
    { headers: apiHeaders },
  );
}
