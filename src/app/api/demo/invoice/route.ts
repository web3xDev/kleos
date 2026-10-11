// Pay a KleosCredit invoice for the demo tool: an x402 payment of the invoiced
// amount to the creditor. The handler runs after the payment is verified and
// before it settles; if the invoice is not an open one of this tool's, it
// answers 4xx and x402 cancels the settlement, so nothing is charged.
//
// The answer is countersigned like any other call, so the agent's stamp for
// this payment is two-sided. The response also carries the tool's signed
// "I was paid for this invoice", which KleosCredit.pay requires from the
// creditor; x402 only delivers this response once the payment settled.

import { NextResponse, type NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { createPublicClient, http, isAddressEqual } from "viem";
import { acknowledgePayment, countersignPaidCall, kleosCreditAbi } from "kleos";
import { addresses, chain } from "@/lib/chain";
import { PRICE_ATOMIC, TOOL_ID, toolAccount } from "@/lib/demo-tool";
import { MONAD_TESTNET, payTo, resourceServer } from "@/lib/x402-server";

async function handler(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return NextResponse.json({ error: "invoice id required" }, { status: 400 });

  const client = createPublicClient({ chain, transport: http() });
  const inv = await client.readContract({
    address: addresses.kleosCredit,
    abi: kleosCreditAbi,
    functionName: "getInvoice",
    args: [id as `0x${string}`],
  });
  if (inv.openedAt === 0n) return NextResponse.json({ error: "no such invoice" }, { status: 404 });
  if (inv.paidAt !== 0n) return NextResponse.json({ error: "invoice already paid" }, { status: 409 });
  if (!isAddressEqual(inv.creditor, payTo()) || inv.amount.toString() !== PRICE_ATOMIC || inv.tool !== TOOL_ID) {
    return NextResponse.json({ error: "not this tool's invoice" }, { status: 409 });
  }

  const answer = JSON.stringify({
    tool: TOOL_ID,
    invoiceId: id,
    agentId: inv.agentId.toString(),
    amount: inv.amount.toString(),
    note: "Invoice settled. The answer was served when credit was granted.",
  });
  const res = new NextResponse(answer, { headers: { "content-type": "application/json" } });
  const account = toolAccount();
  if (account) {
    const cs = await countersignPaidCall({ account, headers: req.headers, tool: TOOL_ID, answer }).catch(() => null);
    if (cs) res.headers.set(cs.name, cs.value);
    const ack = await acknowledgePayment({ account, network: "monad-testnet", invoiceId: id as `0x${string}`, amount: inv.amount });
    res.headers.set(ack.name, ack.value);
  }
  return res;
}

export const GET = withX402(
  handler,
  {
    accepts: { scheme: "exact", network: MONAD_TESTNET, payTo: payTo(), price: "$0.01" },
    description: "Pay a Kleos demo tool invoice",
    mimeType: "application/json",
  },
  resourceServer(),
);
