// Creates the server's Privy authorization key: the signer that makes the demo
// runtime's everyday signatures (payments, stamps), only within the policy. It
// cannot change the policy or the wallet; that is the owner's (the passkey's).
// Run once from kleos/ (needs PRIVY_APP_ID and PRIVY_APP_SECRET in .env.local):
//
//   node scripts/privy-signer.mjs
//
// Prints PRIVY_SIGNER_KEY (secret: goes to .env.local and Vercel only) and
// PRIVY_SIGNER_ID (the key quorum Privy created for it).

import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

// A P-256 key pair: PKCS#8 private key, SPKI public key, both base64 DER.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const privateB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const publicB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

const res = await fetch("https://api.privy.io/v1/key_quorums", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "privy-app-id": appId,
    authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
  },
  body: JSON.stringify({ public_keys: [publicB64], authorization_threshold: 1, display_name: "Kleos server signer" }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`POST /key_quorums failed (${res.status}): ${text}`);
  process.exit(1);
}
const quorum = JSON.parse(text);

console.log("Add to .env.local (and Vercel). The key is secret; do not paste it anywhere else.\n");
console.log(`PRIVY_SIGNER_ID=${quorum.id}`);
console.log(`PRIVY_SIGNER_KEY=${privateB64}`);
