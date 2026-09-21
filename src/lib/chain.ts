// Monad network and contract addresses. One network at a time; never mix
// testnet and mainnet numbers on the same page.

import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  testnet: true,
});

export const chain = monadTestnet;

export const addresses = {
  // ERC-8004 Trustless Agents, from erc-8004/erc-8004-contracts.
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  // Kleos, deployed 2026-09-21 from contracts/script/Deploy.s.sol.
  kleosStamps: "0xb63DE9add37AF3Edd48Db8C1555578e6C1A8Cb18",
  // Monad testnet USDC, the x402 asset.
  usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
} as const;

export const x402Facilitator = "https://x402-facilitator.molandak.org";
