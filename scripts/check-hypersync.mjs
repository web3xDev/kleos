// Reads the registry and KleosStamps through Envio HyperSync, the way the site
// does (src/lib/hypersync.ts), and prints what it found. Run from kleos/:
//
//   node scripts/check-hypersync.mjs
//
// Needs ENVIO_API_TOKEN in the environment or .env.local (only that variable is read).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createJiti } from "jiti";

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

const token = await envVar("ENVIO_API_TOKEN");
if (!token) {
  console.error("ENVIO_API_TOKEN is not set (environment or .env.local).");
  process.exit(1);
}

const jiti = createJiti(import.meta.url, { alias: { "@": join(process.cwd(), "src") } });
const { fromHyperSync } = await jiti.import(join(process.cwd(), "src/lib/hypersync.ts"));

const t0 = Date.now();
const d = await fromHyperSync(token);
console.log(`HyperSync: ${d.total} agents, ${d.withTrackRecord} with a record, ${d.totalStamps} stamps, in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const a of d.agents.filter((x) => x.stamps > 0 || x.kleos).slice(-5)) {
  console.log(`  #${a.id} ${a.name ?? "(no name)"} · stamps ${a.stamps} · runtime ${a.wallet ?? "none"} · kleos ${a.kleos}`);
}
