// Monad network and contract addresses. One network at a time; never mix
// testnet and mainnet numbers on the same page.

import { defineChain, fallback, http } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const chain = monadTestnet;

/**
 * RPC for server code: KLEOS_RPC_URL (a provider endpoint, often with a key in
 * the URL) first, the public RPC as a fallback when it errors. Not NEXT_PUBLIC_,
 * so it never reaches the browser; browser code keeps the public RPC.
 */
export function serverTransport() {
  const url = process.env.KLEOS_RPC_URL;
  return url ? fallback([http(url), http()]) : http();
}

export const addresses = {
  // ERC-8004 Trustless Agents, from erc-8004/erc-8004-contracts.
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  // Kleos, deployed together at launch (2026-10-13, block 70627137) from
  // contracts/script/DeployAll.s.sol: every record starts here.
  kleosStamps: "0x1192f1EFE2cd543C24417254B7ff488Ddb6C0F04",
  // Invoices for work served before payment. Closing needs the creditor's acknowledgement.
  kleosCredit: "0x5D9680B8Fdf7DC3a543A2b539d410a3EFCcb9bEE",
  // Monad testnet USDC, the x402 asset.
  usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
} as const;

export const x402Facilitator = "https://x402-facilitator.molandak.org";

/** Kleos's own demo agent (the one /try runs). Its runtime key lives on our server.
 *  The one place its id is set: the Try page, the demo routes and the profile all read it here. */
export const DEMO_AGENT_ID = 2233n;
/** The demo agent whose runtime is a Privy server wallet under a spending policy. */
export const DEMO_PRIVY_AGENT_ID = 2254n;
/** An agent with no record, for the Pay later demo's "declined" case. */
export const DEMO_NEWCOMER_ID = 1909n;
