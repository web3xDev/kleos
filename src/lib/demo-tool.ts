// The demo tool's shared parts: its id, its key, its answer, and the credit
// it offers. Used by the pay-first route, the pay-later route and the invoice
// route, so all three are the same tool.

import { createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { CreditTerms } from "kleos-sdk";
import { addresses, chain, serverTransport } from "./chain";
import { payTo } from "./x402-server";

export const TOOL_ID = "kleos-demo/monad-block";
export const PRICE_ATOMIC = "10000"; // $0.01 in USDC atomic units

/**
 * The key behind payTo. Verifiers accept a countersignature only from the
 * address that was paid, and KleosCredit makes the opener the creditor, so the
 * tool signs and opens invoices with the same key it is paid to.
 */
export function toolAccount() {
  const key = (process.env.KLEOS_TOOL_KEY ?? process.env.DRIP_PRIVATE_KEY) as `0x${string}` | undefined;
  return key ? privateKeyToAccount(key) : null;
}

/** The tool's answer: the latest Monad block. */
export async function latestBlockAnswer(): Promise<string> {
  const client = createPublicClient({ chain, transport: serverTransport() });
  const block = await client.getBlock();
  return JSON.stringify({
    tool: TOOL_ID,
    network: chain.name,
    blockNumber: block.number.toString(),
    timestamp: Number(block.timestamp),
    hash: block.hash,
  });
}

/**
 * The credit this tool offers, and its rule. Short due time on purpose, so a
 * demo can show an invoice going overdue; a real tool would give days.
 */
export function creditTerms(): CreditTerms {
  return {
    v: 1,
    network: "monad-testnet",
    creditor: payTo(),
    amount: PRICE_ATOMIC,
    asset: addresses.usdc,
    tool: TOOL_ID,
    dueInSeconds: 5 * 60,
    rule: { minVerifiedActions: 20, maxOverdueInvoices: 0 },
  };
}
