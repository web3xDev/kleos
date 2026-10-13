// Shows the demo runtime's Privy policy at work: asks the Privy server wallet
// for signatures it should give and ones it should refuse. Nothing is sent to
// the chain and no funds are needed. Run from kleos/:
//
//   node scripts/privy-check.mjs
//
// Needs PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_WALLET_ID and PRIVY_WALLET_ADDRESS
// (environment or .env.local; only those variables are read).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { privyAccount } from "../packages/kleos/dist/privy.js";

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

const cfg = {
  appId: await envVar("PRIVY_APP_ID"),
  appSecret: await envVar("PRIVY_APP_SECRET"),
  walletId: await envVar("PRIVY_WALLET_ID"),
  address: await envVar("PRIVY_WALLET_ADDRESS"),
};
if (Object.values(cfg).some((v) => !v)) {
  console.error("Set PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_WALLET_ID and PRIVY_WALLET_ADDRESS (environment or .env.local).");
  process.exit(1);
}
const account = privyAccount(cfg);

const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const TOOL = "0x3082375F01131C04F3D0E1C8378a197c9edAfe34";
const usdcPayment = (value) => ({
  domain: { name: "USDC", version: "2", chainId: 10143, verifyingContract: USDC },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: { from: cfg.address, to: TOOL, value, validAfter: 0n, validBefore: 9999999999n, nonce: `0x${"ab".repeat(32)}` },
});

const cases = [
  ["sign a Kleos receipt", true, () => account.signMessage({ message: "kleos receipt check" })],
  ["pay 0.01 USDC over x402", true, () => account.signTypedData(usdcPayment(10_000n))],
  ["pay 1.00 USDC over x402 (over the cap)", false, () => account.signTypedData(usdcPayment(1_000_000n))],
  [
    "send a transaction to an unknown address",
    false,
    () =>
      account.signTransaction({
        type: "eip1559",
        to: "0x000000000000000000000000000000000000dEaD",
        value: 0n,
        chainId: 10143,
        nonce: 0,
        gas: 21000n,
        maxFeePerGas: 200_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      }),
  ],
];

console.log(`Privy wallet ${cfg.address}\n`);
for (const [label, expected, run] of cases) {
  let signed = false;
  let note = "";
  try {
    await run();
    signed = true;
  } catch (e) {
    note = String(e.message).split("\n")[0].slice(0, 110);
  }
  const ok = signed === expected;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${signed ? "signed" : "refused by Privy"}${!signed && note ? `  (${note})` : ""}`);
}
