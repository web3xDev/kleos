// Shared bits for the handlers: the network totals row, and an agent row
// that exists even if an event arrives before the agent was seen.

import type { Agent, Network } from "envio";

export const NETWORK_ID = "monad-testnet";

export const emptyNetwork: Network = {
  id: NETWORK_ID,
  agents: 0,
  agentsWithRecord: 0,
  stamps: 0,
  usdcSettled: 0n,
  invoices: 0,
};

export function emptyAgent(id: string, block: { number: number; timestamp: number }): Agent {
  return {
    id,
    owner: "",
    uri: undefined,
    name: undefined,
    wallet: undefined,
    kleos: false,
    registeredAt: block.timestamp,
    registeredBlock: block.number,
    stampCount: 0,
    usdcSettled: 0n,
    lastStampAt: undefined,
    invoiceCount: 0,
    invoicesPaid: 0,
  };
}

/** The agent's name from an inline `data:application/json;base64,` registration card. */
export function nameFromUri(uri: string): string | undefined {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) return undefined;
  try {
    const card = JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8")) as { name?: unknown };
    return typeof card.name === "string" && card.name.trim() ? card.name : undefined;
  } catch {
    return undefined;
  }
}
