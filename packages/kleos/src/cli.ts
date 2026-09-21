#!/usr/bin/env node
// kleos pair <agentId>   print a pairing code for the owner to approve
// kleos whoami           print this runtime's address

import { encodePairing, loadOrCreateRuntimeKey, pair, runtimeKeyPath } from "./runtime.js";
import type { NetworkName } from "./chain.js";

const [cmd, ...rest] = process.argv.slice(2);
const network = (process.env.KLEOS_NETWORK ?? "monad-testnet") as NetworkName;

async function main() {
  const account = loadOrCreateRuntimeKey();

  if (cmd === "whoami") {
    console.log(account.address);
    console.log(`key: ${runtimeKeyPath()}`);
    return;
  }

  if (cmd === "pair") {
    const id = rest[0];
    if (!id || !/^\d+$/.test(id)) {
      console.error("usage: kleos pair <agentId>");
      process.exit(2);
    }
    const payload = await pair(network, BigInt(id), account);
    const code = encodePairing(payload);
    console.log("");
    console.log(`Runtime ${account.address}`);
    console.log(`Agent   #${id} on ${network}`);
    console.log("");
    console.log("Pairing code (valid 4 minutes). Paste it in Kleos → your agent → Connect runtime:");
    console.log("");
    console.log(code);
    console.log("");
    return;
  }

  console.error("usage: kleos <pair <agentId> | whoami>");
  process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
