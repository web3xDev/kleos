// The whole ERC-8004 registry on Monad, for Explore and the public API.
//
// Primary source: the Envio indexer (indexer/), one GraphQL query over every
// agent, built from Registered / MetadataSet / Transfer and KleosStamps events.
// Used when ENVIO_GRAPHQL_URL is set.
//
// Fallback: a direct scan via Multicall3. Public RPC caps eth_getLogs at 100
// blocks, so it reads token state instead: ~2k agents is a handful of
// multicalls, but slow on a cold start. It also runs whenever Envio errors.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient } from "viem";
import { addresses, chain, serverTransport } from "./chain";
import { identityRegistryAbi, parseRegistration } from "./erc8004";
import { kleosStampsAbi } from "./stamps";
import { fromHyperSync } from "./hypersync";

export type ExploreAgent = {
  id: number;
  name: string | null;
  owner: `0x${string}`;
  wallet: `0x${string}` | null;
  stamps: number;
  kleos: boolean; // registered through Kleos (has an encryption key)
};

export type ExploreData = {
  total: number;
  withTrackRecord: number;
  totalStamps: number;
  agents: ExploreAgent[];
  scannedAt: number;
  /** Where this listing came from: the hosted indexer, HyperSync, or the RPC scan. */
  source?: "envio-indexer" | "envio-hypersync" | "rpc";
};

const client = createPublicClient({ chain, transport: serverTransport() });
const registry = { address: addresses.identityRegistry, abi: identityRegistryAbi } as const;
const stampsC = { address: addresses.kleosStamps, abi: kleosStampsAbi } as const;

const ZERO = "0x0000000000000000000000000000000000000000";
const CHUNK = 300;

/**
 * The public RPC allows 15 requests/second across everything the app does.
 * One multicall at a time, spaced out, and back off hard on a rate limit.
 */
const GAP_MS = 220;
let lastCall = 0;

async function mc<T>(contracts: Parameters<typeof client.multicall>[0]["contracts"]): Promise<Array<{ status: "success"; result: T } | { status: "failure" }>> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const out = (await client.multicall({ contracts, allowFailure: true, batchSize: 0 })) as Array<
      { status: "success"; result: T } | { status: "failure"; error?: { details?: string } }
    >;
    const allFailed = out.length > 0 && out.every((o) => o.status === "failure");
    if (!allFailed) return out;
    const detail = (out[0] as { error?: { details?: string } }).error?.details ?? "";
    // Every call reverting is a real answer (e.g. ownerOf past the last id).
    // Every call failing at the RPC layer is not; back off, then give up loudly.
    if (!/limited|rate|429|request failed/i.test(detail)) return out;
    if (attempt >= 6) throw new Error(`registry scan rate-limited: ${detail}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

// Stale-while-revalidate. The last scan is kept in memory and on disk; a
// request is answered from it immediately and a refresh runs in the
// background when it is older than TTL. Nobody waits 25 seconds.
const TTL = 60_000;
const SNAPSHOT = join(process.cwd(), ".data", "explore.json");

let cache: { data: ExploreData; at: number } | null = loadSnapshot();
let inflight: Promise<ExploreData> | null = null;

function loadSnapshot(): { data: ExploreData; at: number } | null {
  try {
    const data = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as ExploreData;
    return { data, at: data.scannedAt };
  } catch {
    return null;
  }
}

function saveSnapshot(data: ExploreData): void {
  try {
    mkdirSync(join(process.cwd(), ".data"), { recursive: true });
    writeFileSync(SNAPSHOT, JSON.stringify(data));
  } catch {
    // disk is a convenience; memory still has it
  }
}

// On Vercel the disk does not survive a cold start, so the last scan is also
// kept in Blob: a fresh server answers from it at once instead of scanning
// ~2k agents first, then refreshes behind the response.
const BLOB_SNAPSHOT = "snapshots/explore.json";
const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function loadBlobSnapshot(): Promise<ExploreData | null> {
  if (!blobEnabled()) return null;
  try {
    const { head } = await import("@vercel/blob");
    const meta = await head(BLOB_SNAPSHOT);
    // Cache-busting query: the CDN copy can lag an overwrite.
    const res = await fetch(`${meta.url}?v=${Date.now()}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as ExploreData) : null;
  } catch {
    return null;
  }
}

async function saveBlobSnapshot(data: ExploreData): Promise<void> {
  if (!blobEnabled()) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(BLOB_SNAPSHOT, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json",
    });
  } catch {
    // a missed save only means the next cold start scans
  }
}

/**
 * Highest existing id. Ids are minted densely from 0 but tokens can be
 * burned, so probe in windows: the registry ends where a whole window of
 * ownerOf calls fails.
 */
async function highestId(): Promise<number> {
  const WINDOW = 200;
  let start = Math.max(0, (cache?.data.agents.at(-1)?.id ?? 0) - WINDOW);
  let last = -1;
  for (;;) {
    const ids = Array.from({ length: WINDOW }, (_, i) => start + i);
    const res = await mc<`0x${string}`>(ids.map((id) => ({ ...registry, functionName: "ownerOf", args: [BigInt(id)] })));
    let any = false;
    res.forEach((r, i) => {
      if (r.status === "success") {
        any = true;
        last = ids[i];
      }
    });
    if (!any) return last;
    start += WINDOW;
  }
}

async function scan(): Promise<ExploreData> {
  const top = await highestId();
  const ids = Array.from({ length: top + 1 }, (_, i) => i);
  const agents: ExploreAgent[] = [];

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const owners = await mc<`0x${string}`>(slice.map((id) => ({ ...registry, functionName: "ownerOf", args: [BigInt(id)] })));
    const uris = await mc<string>(slice.map((id) => ({ ...registry, functionName: "tokenURI", args: [BigInt(id)] })));
    const wallets = await mc<`0x${string}`>(slice.map((id) => ({ ...registry, functionName: "getAgentWallet", args: [BigInt(id)] })));
    const encKeys = await mc<string>(
      slice.map((id) => ({ ...registry, functionName: "getMetadata", args: [BigInt(id), "kleos.encryptionKey"] })),
    );
    const counts = await mc<bigint>(slice.map((id) => ({ ...stampsC, functionName: "stampCount", args: [BigInt(id)] })));
    slice.forEach((id, j) => {
      const owner = owners[j].status === "success" ? (owners[j].result as `0x${string}`) : null;
      if (!owner) return; // burned or gap
      const uri = uris[j].status === "success" ? (uris[j].result as string) : "";
      const wallet = wallets[j].status === "success" ? (wallets[j].result as `0x${string}`) : ZERO;
      const enc = encKeys[j].status === "success" ? (encKeys[j].result as string) : "0x";
      const count = counts[j].status === "success" ? Number(counts[j].result as bigint) : 0;
      agents.push({
        id,
        name: parseRegistration(uri)?.name ?? null,
        owner,
        wallet: wallet === ZERO || wallet.toLowerCase() === owner.toLowerCase() ? null : wallet,
        stamps: count,
        kleos: enc !== "0x",
      });
    });
  }

  const withTrackRecord = agents.filter((a) => a.stamps > 0).length;
  const totalStamps = agents.reduce((s, a) => s + a.stamps, 0);
  return { total: agents.length, withTrackRecord, totalStamps, agents, scannedAt: Date.now() };
}

const ENVIO_PAGE = 1000;

type EnvioAgent = { id: string; name: string | null; owner: string; wallet: string | null; kleos: boolean; stampCount: number };

/** Every agent from the Envio indexer, paged. Throws on any error so the caller can fall back. */
async function fromEnvio(url: string): Promise<ExploreData> {
  const query = `query Agents($limit: Int!, $offset: Int!) {
    Agent(limit: $limit, offset: $offset, order_by: { registeredBlock: asc }) { id name owner wallet kleos stampCount }
  }`;
  const rows: EnvioAgent[] = [];
  for (let offset = 0; ; offset += ENVIO_PAGE) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { limit: ENVIO_PAGE, offset } }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`envio ${res.status}`);
    const body = (await res.json()) as { data?: { Agent: EnvioAgent[] }; errors?: { message: string }[] };
    if (body.errors?.length || !body.data) throw new Error(`envio: ${body.errors?.[0]?.message ?? "no data"}`);
    rows.push(...body.data.Agent);
    if (body.data.Agent.length < ENVIO_PAGE) break;
  }
  // An indexer that has not synced yet answers with nothing; that is not "no agents".
  if (rows.length === 0) throw new Error("envio: no agents indexed yet");

  const agents: ExploreAgent[] = rows
    .map((r) => ({
      id: Number(r.id),
      name: r.name,
      owner: r.owner as `0x${string}`,
      wallet: (r.wallet as `0x${string}` | null) ?? null,
      stamps: r.stampCount,
      kleos: r.kleos,
    }))
    .sort((a, b) => a.id - b.id);
  const withTrackRecord = agents.filter((a) => a.stamps > 0).length;
  const totalStamps = agents.reduce((s, a) => s + a.stamps, 0);
  return { total: agents.length, withTrackRecord, totalStamps, agents, scannedAt: Date.now() };
}

/** Envio when configured, the RPC scan otherwise or when Envio fails. */
/** The hosted Envio indexer, then Envio HyperSync, then the RPC scan: the first that answers. */
async function load(): Promise<ExploreData> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (url) {
    try {
      return { ...(await fromEnvio(url)), source: "envio-indexer" };
    } catch (e) {
      console.warn(`[explore] Envio indexer unavailable: ${e instanceof Error ? e.message : e}`);
    }
  }
  const token = process.env.ENVIO_API_TOKEN;
  if (token) {
    try {
      return { ...(await fromHyperSync(token)), source: "envio-hypersync" };
    } catch (e) {
      console.warn(`[explore] HyperSync unavailable, scanning the registry over RPC: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { ...(await scan()), source: "rpc" };
}

function refresh(): Promise<ExploreData> {
  if (!inflight) {
    inflight = load()
      .then(async (data) => {
        cache = { data, at: Date.now() };
        saveSnapshot(data);
        await saveBlobSnapshot(data);
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The refresh still running behind a response, if any: route handlers hand it to after(). */
export function refreshing(): Promise<unknown> | null {
  return inflight;
}

export async function explore(): Promise<ExploreData> {
  if (!cache) {
    const snapshot = await loadBlobSnapshot();
    if (snapshot) cache = { data: snapshot, at: snapshot.scannedAt };
  }
  if (cache) {
    if (Date.now() - cache.at >= TTL) void refresh().catch(() => null);
    return cache.data;
  }
  return refresh();
}

// Warm the cache as soon as the server loads this module.
void refresh().catch(() => null);
