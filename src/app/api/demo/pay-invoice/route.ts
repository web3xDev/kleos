// Pay one of the demo agent's open invoices, as the agent: its runtime pays the
// invoice over x402, stamps the payment and closes the invoice on KleosCredit.
// Only the demo agent's invoices, and only the demo runtime pays: Kleos never
// holds or moves anyone else's money.

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Stamper, kleosCreditAbi, networks, payInvoice, payingFetch, type InvoiceNotice } from "kleos";
import { DEMO_AGENT_ID, addresses, chain } from "@/lib/chain";
import { TOOL_ID } from "@/lib/demo-tool";
import { acquireDemo, busyResponse } from "@/lib/demo-lock";
import { ensureRuntimeGas } from "@/lib/demo-gas";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = process.env.KLEOS_DEMO_RUNTIME_KEY as `0x${string}` | undefined;
  const demoAgentId = DEMO_AGENT_ID.toString();
  if (!key) return NextResponse.json({ error: "demo not configured" }, { status: 503 });

  const { invoiceId } = (await req.json().catch(() => ({}))) as { invoiceId?: string };
  if (!invoiceId || !/^0x[0-9a-fA-F]{64}$/.test(invoiceId)) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

  const client = createPublicClient({ chain, transport: http() });
  const inv = await client.readContract({
    address: addresses.kleosCredit,
    abi: kleosCreditAbi,
    functionName: "getInvoice",
    args: [invoiceId as `0x${string}`],
  });
  if (inv.openedAt === 0n) return NextResponse.json({ error: "no such invoice" }, { status: 404 });
  if (inv.agentId.toString() !== demoAgentId) return NextResponse.json({ error: "only the demo agent's invoices can be paid here" }, { status: 403 });
  if (inv.paidAt !== 0n) return NextResponse.json({ error: "already paid" }, { status: 409 });

  if (!acquireDemo()) return busyResponse();

  const origin = new URL(req.url).origin;
  const network = "monad-testnet" as const;
  const account = privateKeyToAccount(key);
  await ensureRuntimeGas(account.address).catch(() => {});
  const invoice: InvoiceNotice = {
    v: 1,
    invoiceId: invoiceId as `0x${string}`,
    agentId: demoAgentId,
    amount: inv.amount.toString(),
    dueAt: Number(inv.dueAt),
    openTx: "0x",
    payUrl: `${origin}/api/demo/invoice?id=${invoiceId}`,
  };
  try {
    const paid = await payInvoice({
      fetch: payingFetch(network, account),
      invoice,
      stamper: new Stamper({ network, agentId: BigInt(demoAgentId), account, kleosUrl: process.env.KLEOS_URL ?? origin }),
      account,
      network,
      tool: TOOL_ID,
      platform: "kleos-demo",
      asset: networks[network].usdc,
    });
    return NextResponse.json({ ok: true, settlementTx: paid.settlementTx, closeTx: paid.closeTx });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) }, { status: 500 });
  }
}
