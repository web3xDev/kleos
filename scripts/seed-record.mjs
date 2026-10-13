// Builds the demo agent's record through the same routes the Try page uses:
// real x402 payments, real stamps, real invoices. Run from kleos/ while the
// site is up (local dev server or the deployed one):
//
//   node scripts/seed-record.mjs                                   # 25 pay first, then 8 pay later, on localhost:3005
//   node scripts/seed-record.mjs --base https://kleos.finance --first 25 --later 8
//
// Runs one at a time; the demo routes allow a run every 15 s, so it waits in
// between and retries when the demo is busy.

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const base = opt("base", "http://localhost:3005").replace(/\/$/, "");
const first = Number(opt("first", 25));
const later = Number(opt("later", 8));
const GAP_MS = 16_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One run; resolves to { ok, detail } from the streamed steps. */
async function run(path, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    // A dropped connection never reached the site (no run started): wait and try again.
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).catch((e) => {
      console.log(`  connection failed (${e.cause?.code ?? e.message}), retrying`);
      return null;
    });
    if (!res) {
      await sleep(GAP_MS);
      continue;
    }
    if (res.status === 429) {
      await sleep(GAP_MS);
      continue;
    }
    if (!res.ok) return { ok: false, detail: `${res.status} ${await res.text()}` };
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const error = lines.find((l) => l.status === "error");
    const done = lines.find((l) => l.step === "done" && l.status === "done");
    return error ? { ok: false, detail: `${error.step}: ${error.detail ?? ""}` } : { ok: Boolean(done), detail: done ? "ok" : "no done step" };
  }
  return { ok: false, detail: "demo stayed busy" };
}

async function series(label, n, path, body) {
  let ok = 0;
  for (let i = 1; i <= n; i++) {
    const t0 = Date.now();
    const r = await run(path, body);
    if (r.ok) ok++;
    console.log(`${label} ${String(i).padStart(2)}/${n}  ${r.ok ? "✓" : "✗"}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${r.ok ? "" : r.detail}`);
    if (i < n) await sleep(GAP_MS);
  }
  return ok;
}

console.log(`Seeding the demo agent on ${base}: ${first} pay first, then ${later} pay later.\n`);
const a = await series("pay first", first, "/api/demo/run");
if (later > 0) await sleep(GAP_MS);
const b = await series("pay later", later, "/api/demo/credit", { as: "agent" });
console.log(`\nDone: ${a}/${first} pay first, ${b}/${later} pay later.`);
console.log("Pay later needs at least 20 verified actions; if those failed, run the pay first part again.");
