// A real paid tool on Monad testnet, 0.01 USDC per call: the latest Monad
// block and its timestamp. Small on purpose; what matters is that the answer
// comes from chain and the payment settles on chain, so a stamp for it is
// provable end to end.

import { NextResponse, type NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { createPublicClient, http } from "viem";
import { chain } from "@/lib/chain";
import { MONAD_TESTNET, payTo, resourceServer } from "@/lib/x402-server";

export const TOOL_ID = "kleos-demo/monad-block";

async function handler(_req: NextRequest) {
  const client = createPublicClient({ chain, transport: http() });
  const block = await client.getBlock();
  return NextResponse.json({
    tool: TOOL_ID,
    network: chain.name,
    blockNumber: block.number.toString(),
    timestamp: Number(block.timestamp),
    hash: block.hash,
  });
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
