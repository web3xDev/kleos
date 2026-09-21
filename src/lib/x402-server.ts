// x402 resource server for Monad testnet. Used by the demo tool that the
// playground agent pays for; also the reference for "add Kleos to an x402
// server" in the docs.

import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { addresses, x402Facilitator } from "./chain";

export const MONAD_TESTNET: Network = "eip155:10143";

let server: x402ResourceServer | null = null;

export function resourceServer(): x402ResourceServer {
  if (server) return server;
  const facilitator = new HTTPFacilitatorClient({ url: x402Facilitator });
  const scheme = new ExactEvmScheme();
  // @x402/evm ships no default asset for chain 10143; declare testnet USDC
  // (EIP-712 domain name "USDC", version "2") so "$0.01" prices resolve.
  scheme.registerMoneyParser(async (amount: string | number, network: string) => {
    if (network !== MONAD_TESTNET) return null;
    return {
      amount: Math.floor(Number(amount) * 1_000_000).toString(),
      asset: addresses.usdc,
      extra: { name: "USDC", version: "2" },
    };
  });
  server = new x402ResourceServer(facilitator).register(MONAD_TESTNET, scheme);
  return server;
}

/** Where demo-tool payments go. */
export function payTo(): `0x${string}` {
  const to = process.env.KLEOS_PAY_TO as `0x${string}` | undefined;
  if (!to) throw new Error("KLEOS_PAY_TO not set");
  return to;
}
