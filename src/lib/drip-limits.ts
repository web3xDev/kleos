// Limits for the testnet gas drip, so nobody can drain it by calling it in a
// loop. Every drip leaves one small immutable record (Vercel Blob when a token
// is configured, local files in development), and the limits count those
// records. Records are never overwritten, so a cached read can't hide a drip.
// IPs are stored hashed, never raw.

import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const LIMITS = {
  perAddressPerDay: 2,
  perAddressEver: 5,
  perIpPerDay: 3,
  perNetworkPerDay: 40,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_DIR = join(process.cwd(), ".data", "drip");

type Entry = { scope: string; ts: number };

function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** The caller's IP, hashed. On Vercel x-forwarded-for is set by the platform. */
export function ipKey(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`kleos-drip:${ip}`).digest("hex").slice(0, 32);
}

const utcDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

// One record per drip under each scope it counts against.
function scopes(address: string, ip: string, ts: number): string[] {
  return [`address/${address.toLowerCase()}`, `ip/${ip}`, `day/${utcDay(ts)}`];
}

async function entries(scope: string): Promise<Entry[]> {
  if (blobEnabled()) {
    const { list } = await import("@vercel/blob");
    const out: Entry[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `drip/${scope}/`, cursor });
      for (const b of page.blobs) out.push({ scope, ts: Number(b.pathname.split("/").pop()?.split("-")[0]) || 0 });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  try {
    const files = await readdir(join(LOCAL_DIR, scope));
    return files.map((f) => ({ scope, ts: Number(f.split("-")[0]) || 0 }));
  } catch {
    return [];
  }
}

/** Why this drip is refused, or null if it is within every limit. */
export async function checkDripLimits(address: string, ip: string, now = Date.now()): Promise<string | null> {
  const [byAddress, byIp, byDay] = await Promise.all(scopes(address, ip, now).map(entries));
  const recent = (es: Entry[]) => es.filter((e) => now - e.ts < DAY_MS).length;

  if (byAddress.length >= LIMITS.perAddressEver) return "This account has already received its testnet gas.";
  if (recent(byAddress) >= LIMITS.perAddressPerDay) return "This account received gas today. Try again tomorrow.";
  if (recent(byIp) >= LIMITS.perIpPerDay) return "Too many new accounts from this network today. Try again tomorrow.";
  if (byDay.length >= LIMITS.perNetworkPerDay) return "Today's testnet gas is used up. Try again tomorrow.";
  return null;
}

/** Record a drip before sending it, so a burst of parallel calls can't all pass the check. */
export async function recordDrip(address: string, ip: string, now = Date.now()): Promise<void> {
  const name = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  await Promise.all(
    scopes(address, ip, now).map(async (scope) => {
      if (blobEnabled()) {
        const { put } = await import("@vercel/blob");
        await put(`drip/${scope}/${name}`, "1", { access: "public", addRandomSuffix: false, contentType: "text/plain" });
        return;
      }
      await mkdir(join(LOCAL_DIR, scope), { recursive: true });
      await writeFile(join(LOCAL_DIR, scope, name), "1");
    }),
  );
}
