// One-off: copy the local sealed-receipt store (.data/stamps) to Vercel Blob,
// under the same keys the site reads (stamps/<agentId>/<receiptHash>.json).
// Receipts already in Blob are skipped, so it is safe to run twice.
//
//   node scripts/migrate-stamps-to-blob.mjs            # dry run: lists what it would copy
//   node scripts/migrate-stamps-to-blob.mjs --write    # copies
//
// Needs BLOB_READ_WRITE_TOKEN, from the environment or .env.local (only that
// variable is read from the file).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(process.cwd(), ".data", "stamps");
const write = process.argv.includes("--write");

async function token() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const env = await readFile(join(process.cwd(), ".env.local"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("BLOB_READ_WRITE_TOKEN="));
    return line?.slice("BLOB_READ_WRITE_TOKEN=".length).trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

const tok = await token();
if (!tok) {
  console.error("BLOB_READ_WRITE_TOKEN is not set (environment or .env.local). Create the Blob store in Vercel first.");
  process.exit(1);
}
const { head, put } = await import("@vercel/blob");

const agents = await readdir(ROOT).catch(() => []);
let copied = 0;
let skipped = 0;
for (const agentId of agents) {
  const files = (await readdir(join(ROOT, agentId))).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const key = `stamps/${agentId}/${f.toLowerCase()}`;
    const exists = await head(key, { token: tok }).then(() => true, () => false);
    if (exists) {
      skipped++;
      continue;
    }
    if (write) {
      const body = await readFile(join(ROOT, agentId, f), "utf8");
      await put(key, body, { access: "public", addRandomSuffix: false, contentType: "application/json", token: tok });
    }
    copied++;
    console.log(`${write ? "copied" : "would copy"} ${key}`);
  }
}
console.log(`\n${write ? "Copied" : "Would copy"} ${copied}, already in Blob ${skipped}.${write ? "" : " Run again with --write to copy."}`);
