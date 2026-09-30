// GET /api/agents/:id
// Identity, runtime, track record, invoices and the latest public receipts. No score.
import { NextResponse } from "next/server";
import { loadAgent } from "@/lib/agents";

import { listAnchoredStamps, apiHeaders, publicClient, stampPublic, trackRecordOf } from "@/lib/api";
import { addresses, chain } from "@/lib/chain";
import { fetchInvoices, invoiceStatus } from "@/lib/credit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "agent id must be an integer" }, { status: 400 });
  const agent = await loadAgent(publicClient, BigInt(id)).catch(() => null);
  if (!agent) return NextResponse.json({ error: "no such agent" }, { status: 404 });
  const [stamps, invoices] = await Promise.all([listAnchoredStamps(id), fetchInvoices(publicClient, BigInt(id))]);
  // Pay later history from KleosCredit: what a tool's rule (Kleos Engine v0) looks at besides stamps.
  const now = Math.floor(Date.now() / 1000);
  const statuses = invoices.map((i) => invoiceStatus(i, now));
  const count = (s: string) => statuses.filter((x) => x === s).length;
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
      invoices: {
        total: invoices.length,
        open: count("open"),
        overdue: count("overdue"),
        paid: count("paid"),
        paidLate: count("paid-late"),
        latest: invoices.slice(0, 10).map((i, k) => ({
          invoiceId: i.id,
          status: statuses[k],
          creditor: i.creditor,
          tool: i.tool,
          amount: i.amount.toString(),
          openedAt: i.openedAt,
          dueAt: i.dueAt,
          paidAt: i.paidAt,
          receiptHash: i.receiptHash,
        })),
      },
      latestStamps: stamps.slice(0, 10).map(stampPublic),
      stamps: `/api/agents/${id}/stamps`,
      note: "Numbers are computed from stamps anchored in KleosStamps next to x402 settlements on Monad. Verify any stamp at /api/verify/{receiptHash}?agentId= or in your own client.",
    },
    { headers: apiHeaders },
  );
}
