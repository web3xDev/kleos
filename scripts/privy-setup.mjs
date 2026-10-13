// Creates the demo runtime's Privy server wallet and its spending policy.
// Run once from kleos/ (needs PRIVY_APP_ID and PRIVY_APP_SECRET in .env.local):
//
//   node scripts/privy-setup.mjs
//
// Prints the policy id, wallet id and address. Privy enforces the policy on
// every signature; anything it does not allow is refused (deny by default):
//   - x402 payments: USDC on Monad testnet only, at most 0.05 USDC each
//   - EIP-712 consents only for KleosCredit (credit) and the ERC-8004 registry (pairing)
//   - transactions only to KleosStamps and KleosCredit, only on Monad testnet
//   - receipt signatures (personal_sign)

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Checksummed, the way viem and x402 put them in the requests the policy sees.
const IDENTITY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const STAMPS = "0x1192f1EFE2cd543C24417254B7ff488Ddb6C0F04";
const CREDIT = "0x5D9680B8Fdf7DC3a543A2b539d410a3EFCcb9bEE";
const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const CHAIN_ID = "10143";
const MAX_PER_PAYMENT = "50000"; // 0.05 USDC, 6 decimals

async function envVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    const env = await readFile(join(process.cwd(), ".env.local"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

const appId = await envVar("PRIVY_APP_ID");
const appSecret = await envVar("PRIVY_APP_SECRET");
if (!appId || !appSecret) {
  console.error("PRIVY_APP_ID and PRIVY_APP_SECRET must be set (environment or .env.local).");
  process.exit(1);
}
const headers = {
  "content-type": "application/json",
  "privy-app-id": appId,
  authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
};
async function post(path, body) {
  const res = await fetch(`https://api.privy.io/v1${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    console.error(`POST ${path} failed (${res.status}): ${text}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

const domain = (field, value) => ({ field_source: "ethereum_typed_data_domain", field, operator: "eq", value });
const tx = (field, value) => ({ field_source: "ethereum_transaction", field, operator: "eq", value });

const policy = await post("/policies", {
  version: "1.0",
  name: "Kleos demo runtime",
  chain_type: "ethereum",
  rules: [
    {
      name: "x402: Monad USDC, max 0.05 per payment",
      method: "eth_signTypedData_v4",
      action: "ALLOW",
      conditions: [
        domain("verifyingContract", USDC),
        domain("chainId", CHAIN_ID),
        {
          field_source: "ethereum_typed_data_message",
          field: "value",
          operator: "lte",
          value: MAX_PER_PAYMENT,
          // Must match the request's types exactly, EIP712Domain included (the runtime sends it).
          typed_data: {
            primary_type: "TransferWithAuthorization",
            types: {
              EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
              ],
              TransferWithAuthorization: [
                { name: "from", type: "address" },
                { name: "to", type: "address" },
                { name: "value", type: "uint256" },
                { name: "validAfter", type: "uint256" },
                { name: "validBefore", type: "uint256" },
                { name: "nonce", type: "bytes32" },
              ],
            },
          },
        },
      ],
    },
    {
      name: "Credit consent on KleosCredit",
      method: "eth_signTypedData_v4",
      action: "ALLOW",
      conditions: [domain("verifyingContract", CREDIT), domain("chainId", CHAIN_ID)],
    },
    {
      name: "Runtime pairing on the ERC-8004 registry",
      method: "eth_signTypedData_v4",
      action: "ALLOW",
      conditions: [domain("verifyingContract", IDENTITY), domain("chainId", CHAIN_ID)],
    },
    {
      name: "Stamps on KleosStamps",
      method: "eth_signTransaction",
      action: "ALLOW",
      conditions: [tx("to", STAMPS), tx("chain_id", CHAIN_ID)],
    },
    {
      name: "Close invoices on KleosCredit",
      method: "eth_signTransaction",
      action: "ALLOW",
      conditions: [tx("to", CREDIT), tx("chain_id", CHAIN_ID)],
    },
    {
      name: "Sign Kleos receipts",
      method: "personal_sign",
      action: "ALLOW",
      conditions: [],
    },
  ],
});
console.log(`policy  ${policy.id}`);

const wallet = await post("/wallets", { chain_type: "ethereum", policy_ids: [policy.id], display_name: "Kleos demo runtime" });
console.log(`wallet  ${wallet.id}`);
console.log(`address ${wallet.address}`);
console.log("\nAdd to .env.local (and Vercel): PRIVY_WALLET_ID and PRIVY_WALLET_ADDRESS with the values above.");
