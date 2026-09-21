// ERC-8004 Identity Registry: the subset Kleos uses, plus the registration
// JSON we mint with. Kleos runs no registry of its own; an agent "exists"
// because it is a token here.

import { parseAbi, type Hex } from "viem";

export const identityRegistryAbi = parseAbi([
  "struct MetadataEntry { string metadataKey; bytes metadataValue; }",
  "function register(string agentURI, MetadataEntry[] metadata) returns (uint256 agentId)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "function unsetAgentWallet(uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
]);

// Metadata keys Kleos writes on the agent token.
export const META_ENCRYPTION_KEY = "kleos.encryptionKey"; // compressed secp256k1 pubkey, hex
export const META_KEY_INDEX = "kleos.keyIndex"; // owner-local index the key was derived from

/** ERC-8004 registration-v1 JSON, embedded as a data: URI. */
export function registrationUri(input: { name: string; description?: string }): string {
  const card = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: input.name,
    description: input.description ?? "Agent with a Kleos track record.",
    services: [],
    x402Support: true,
    active: true,
    registrations: [],
    supportedTrust: ["reputation", "kleos"],
  };
  const json = JSON.stringify(card);
  return `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
}

export function parseRegistration(uri: string): { name?: string; description?: string } | null {
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      const json = decodeURIComponent(escape(atob(uri.slice("data:application/json;base64,".length))));
      return JSON.parse(json);
    }
    return null;
  } catch {
    return null;
  }
}

export function hexToUtf8(hex: Hex): string {
  const bytes = hex.slice(2).match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [];
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
