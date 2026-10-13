// Networks and addresses. Testnet first; mainnet entries are here so the
// same package works once the deployment moves.

import { defineChain, parseAbi } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const networks = {
  "monad-testnet": {
    chain: monadTestnet,
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    kleosStamps: "0x1192f1EFE2cd543C24417254B7ff488Ddb6C0F04",
    kleosCredit: "0x5D9680B8Fdf7DC3a543A2b539d410a3EFCcb9bEE",
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

export const kleosCreditAbi = parseAbi([
  "function open(uint256 agentId, uint256 amount, uint64 dueAt, bytes32 invoiceId, string tool, bytes agentSig)",
  "function pay(bytes32 invoiceId, bytes32 receiptHash, bytes creditorSig)",
  "function getInvoice(bytes32 invoiceId) view returns ((uint256 agentId, address creditor, uint256 amount, uint64 openedAt, uint64 dueAt, uint64 paidAt, bytes32 receiptHash, string tool))",
  "function invoicesOf(uint256 agentId) view returns (bytes32[])",
  "event InvoiceOpened(bytes32 indexed invoiceId, uint256 indexed agentId, address indexed creditor, uint256 amount, uint64 dueAt, string tool)",
  "event InvoicePaid(bytes32 indexed invoiceId, uint256 indexed agentId, bytes32 receiptHash, uint64 paidAt)",
]);

/** EIP-712 domain and type of the agent's consent to be invoiced (KleosCredit.open). */
export const creditRequestTypes = {
  CreditRequest: [
    { name: "agentId", type: "uint256" },
    { name: "creditor", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "dueAt", type: "uint64" },
    { name: "invoiceId", type: "bytes32" },
    { name: "tool", type: "string" },
  ],
} as const;

/** The creditor's acknowledgement that an invoice was paid (KleosCredit.pay). */
export const paymentReceivedTypes = {
  PaymentReceived: [
    { name: "invoiceId", type: "bytes32" },
    { name: "amount", type: "uint256" },
  ],
} as const;

export function creditDomain(network: NetworkName) {
  const n = networks[network];
  return { name: "KleosCredit", version: "2", chainId: n.chain.id, verifyingContract: n.kleosCredit } as const;
}

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
