// A real paid tool on Monad testnet, 0.01 USDC per call: the latest Monad
// block and its timestamp. Small on purpose; what matters is that the answer
// comes from chain and the payment settles on chain, so a stamp for it is
// provable end to end.

import { NextResponse, type NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { countersignPaidCall } from "kleos-sdk";
import { TOOL_ID, latestBlockAnswer, toolAccount } from "@/lib/demo-tool";
import { MONAD_TESTNET, payTo, resourceServer } from "@/lib/x402-server";

export { TOOL_ID };

async function handler(req: NextRequest) {
  const answer = await latestBlockAnswer();
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
