// Prints a pairing code for an agent, signed by the Privy server wallet (the
// pairing signature itself goes through Privy and its policy). Paste it in
// Kleos → the agent → Connect runtime. Run from kleos/:
//
//   node scripts/privy-pair.mjs <agentId>

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { encodePairing, pair, privyAccount } from "../packages/kleos/dist/index.js";

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

const id = process.argv[2];
if (!id || !/^\d+$/.test(id)) {
  console.error("usage: node scripts/privy-pair.mjs <agentId>");
  process.exit(2);
}
const account = privyAccount({
  appId: await envVar("PRIVY_APP_ID"),
  appSecret: await envVar("PRIVY_APP_SECRET"),
  walletId: await envVar("PRIVY_WALLET_ID"),
  address: await envVar("PRIVY_WALLET_ADDRESS"),
});

const payload = await pair("monad-testnet", BigInt(id), account);
console.log(`\nRuntime ${account.address} (Privy server wallet)`);
console.log(`Agent   #${id} on monad-testnet\n`);
console.log("Pairing code (valid 4 minutes). Paste it in Kleos → your agent → Connect runtime:\n");
console.log(encodePairing(payload));
