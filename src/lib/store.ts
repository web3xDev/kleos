// Sealed receipt store. It only ever holds ciphertext plus the public receipt;
// anyone could run one. Local JSON files in development, Vercel Blob when a
// token is configured.

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type StoredStamp = {
  receiptHash: `0x${string}`;
  receipt: Record<string, unknown> & { agentId: string; timestamp: number };
  sealed: { v: 1; epk: string; nonce: string; ct: string };
  storedAt: number;
};

const LOCAL_DIR = join(process.cwd(), ".data", "stamps");

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function key(agentId: string, receiptHash: string): string {
  return `stamps/${agentId}/${receiptHash.toLowerCase()}.json`;
}

export async function putStamp(s: StoredStamp): Promise<void> {
  const k = key(s.receipt.agentId, s.receiptHash);
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(k, JSON.stringify(s), { access: "public", addRandomSuffix: false, contentType: "application/json" });
    return;
  }
  const dir = join(LOCAL_DIR, s.receipt.agentId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${s.receiptHash.toLowerCase()}.json`), JSON.stringify(s));
}

export async function getStamp(agentId: string, receiptHash: string): Promise<StoredStamp | null> {
  if (useBlob()) {
    const { head } = await import("@vercel/blob");
    try {
      const meta = await head(key(agentId, receiptHash));
      const res = await fetch(meta.url);
      return (await res.json()) as StoredStamp;
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(await readFile(join(LOCAL_DIR, agentId, `${receiptHash.toLowerCase()}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function listStamps(agentId: string): Promise<StoredStamp[]> {
  let items: StoredStamp[] = [];
  if (useBlob()) {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: `stamps/${agentId}/` });
    items = await Promise.all(blobs.map(async (b) => (await fetch(b.url)).json() as Promise<StoredStamp>));
  } else {
    try {
      const files = await readdir(join(LOCAL_DIR, agentId));
      items = await Promise.all(
        files.map(async (f) => JSON.parse(await readFile(join(LOCAL_DIR, agentId, f), "utf8")) as StoredStamp),
      );
    } catch {
      items = [];
    }
  }
  return items.sort((a, b) => b.receipt.timestamp - a.receipt.timestamp);
}
