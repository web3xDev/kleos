// Monad network and contract addresses. One network at a time; never mix
// testnet and mainnet numbers on the same page.

import { defineChain } from "viem";

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

export const addresses = {
  // ERC-8004 Trustless Agents, from erc-8004/erc-8004-contracts.
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  // Kleos, deployed 2026-09-21 from contracts/script/Deploy.s.sol.
  kleosStamps: "0xb63DE9add37AF3Edd48Db8C1555578e6C1A8Cb18",
  // Invoices for work served before payment, v2, deployed 2026-10-11 (block 70093523) from
  // contracts/script/DeployCredit.s.sol. Closing needs the creditor's acknowledgement.
  kleosCredit: "0x0AC8a281DDf5f34E9b7e022790B7bB2d5F2Dba88",
  // Monad testnet USDC, the x402 asset.
  usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
} as const;

export const x402Facilitator = "https://x402-facilitator.molandak.org";

/** Kleos's own demo agent (the one /try runs). Its runtime key lives on our server. */
export const DEMO_AGENT_ID = 1910n;
