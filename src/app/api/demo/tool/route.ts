// A real paid tool on Monad testnet, 0.01 USDC per call: the latest Monad
// block and its timestamp. Small on purpose; what matters is that the answer
// comes from chain and the payment settles on chain, so a stamp for it is
// provable end to end.

import { NextResponse, type NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { countersignPaidCall } from "kleos";
import { chain } from "@/lib/chain";
import { MONAD_TESTNET, payTo, resourceServer } from "@/lib/x402-server";

export const TOOL_ID = "kleos-demo/monad-block";

// The key behind payTo. Verifiers accept a countersignature only from the
// address that was paid, so the tool signs with the same key it is paid to.
function toolAccount() {
  const key = (process.env.KLEOS_TOOL_KEY ?? process.env.DRIP_PRIVATE_KEY) as `0x${string}` | undefined;
  return key ? privateKeyToAccount(key) : null;
}

async function handler(req: NextRequest) {
  const client = createPublicClient({ chain, transport: http() });
  const block = await client.getBlock();
  const answer = JSON.stringify({
    tool: TOOL_ID,
    network: chain.name,
    blockNumber: block.number.toString(),
    timestamp: Number(block.timestamp),
    hash: block.hash,
  });
  const res = new NextResponse(answer, { headers: { "content-type": "application/json" } });

  // Countersign: "I was paid for this call, and this is the answer I served."
  const account = toolAccount();
  if (account) {
    const cs = await countersignPaidCall({ account, headers: req.headers, tool: TOOL_ID, answer }).catch(() => null);
    if (cs) res.headers.set(cs.name, cs.value);
  }
  return res;
}

export const GET = withX402(
  handler,
  {
    accepts: {
      scheme: "exact",
      network: MONAD_TESTNET,
      payTo: payTo(),
      price: "$0.01",
    },
    description: "Latest Monad testnet block (Kleos demo tool)",
    mimeType: "application/json",
  },
  resourceServer(),
);
