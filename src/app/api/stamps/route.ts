// POST: a runtime stores a signed receipt plus its sealed body.
// GET ?agentId=: list what is stored for an agent (public receipts + ciphertext).
//
// The store is untrusted by design. Nothing here is proof; proof is the hash
// anchored on Monad next to the payment. We still check the receipt's own
// signature and hash so junk cannot be filed under someone else's agent.

import { NextResponse } from "next/server";
import { listAnchoredStamps } from "@/lib/api";
import { isAddressEqual, recoverMessageAddress, toBytes } from "viem";
import { receiptHash, type ReceiptPublic } from "kleos/receipt";
import { getStamp, putStamp, type StoredStamp } from "@/lib/store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<StoredStamp> | null;
  if (!body?.receiptHash || !body.receipt || !body.sealed) {
    return NextResponse.json({ error: "receiptHash, receipt and sealed are required" }, { status: 400 });
  }
  const { signature, ...pub } = body.receipt as Record<string, unknown> & { signature?: `0x${string}` };
  if (!signature || typeof pub.wallet !== "string" || typeof pub.agentId !== "string") {
    return NextResponse.json({ error: "malformed receipt" }, { status: 400 });
  }

  if (pub.v !== 1 && pub.v !== 2) return NextResponse.json({ error: "unknown receipt version" }, { status: 400 });
  const hash = receiptHash(pub as unknown as ReceiptPublic);
  if (hash.toLowerCase() !== body.receiptHash.toLowerCase()) {
    return NextResponse.json({ error: "receiptHash does not match receipt" }, { status: 400 });
  }
  const signer = await recoverMessageAddress({ message: { raw: toBytes(hash) }, signature });
  if (!isAddressEqual(signer, pub.wallet as `0x${string}`)) {
    return NextResponse.json({ error: "signature does not match wallet" }, { status: 400 });
  }
  if (body.sealed.v !== 1 || !body.sealed.epk || !body.sealed.nonce || !body.sealed.ct) {
    return NextResponse.json({ error: "malformed sealed body" }, { status: 400 });
  }

  if (await getStamp(pub.agentId, hash)) return NextResponse.json({ ok: true, existed: true });

  await putStamp({
    receiptHash: hash,
    receipt: body.receipt as StoredStamp["receipt"],
    sealed: body.sealed,
    storedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId || !/^\d+$/.test(agentId)) return NextResponse.json({ error: "agentId required" }, { status: 400 });
  return NextResponse.json({ stamps: await listAnchoredStamps(agentId) });
}
