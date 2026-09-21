// Networks and addresses. Testnet first; mainnet entries are here so the
// same package works once the deployment moves.

import { defineChain, parseAbi } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  testnet: true,
});

export const networks = {
  "monad-testnet": {
    chain: monadTestnet,
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    kleosStamps: "0xb63DE9add37AF3Edd48Db8C1555578e6C1A8Cb18",
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  },
} as const;

export type NetworkName = keyof typeof networks;

export const identityRegistryAbi = parseAbi([
  "function ownerOf(uint256 agentId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
]);

export const kleosStampsAbi = parseAbi([
  "function stamp(uint256 agentId, bytes32 receiptHash, bytes32 settlementTx, string tool, string platform, uint256 amount)",
  "function stampCount(uint256 agentId) view returns (uint64)",
  "function isStamped(uint256 agentId, bytes32 receiptHash) view returns (bool)",
  "event Stamped(uint256 indexed agentId, bytes32 indexed receiptHash, bytes32 settlementTx, bytes32 indexed toolId, string tool, string platform, uint256 amount, address wallet, uint64 timestamp)",
]);

/** EIP-712 domain and type of the ERC-8004 agentWallet proof. */
export const agentWalletTypes = {
  AgentWalletSet: [
    { name: "agentId", type: "uint256" },
    { name: "newWallet", type: "address" },
    { name: "owner", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function agentWalletDomain(network: NetworkName) {
  const n = networks[network];
  return {
    name: "ERC8004IdentityRegistry",
    version: "1",
    chainId: n.chain.id,
    verifyingContract: n.identityRegistry,
  } as const;
}

export const META_ENCRYPTION_KEY = "kleos.encryptionKey";
