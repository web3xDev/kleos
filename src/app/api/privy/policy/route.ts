// POST /api/privy/policy  { body, signature }
// Relays a spending-rules update the owner signed in their browser with the
// passkey-derived key. The server adds only the app credentials Privy needs to
// accept the request; the signature covers the exact body, so the server
// cannot change what the owner approved, and Privy checks it against the owner.

import { NextResponse } from "next/server";
import { privyApi, privyIds } from "@/lib/privy";

export async function POST(req: Request) {
  const { body, signature } = (await req.json().catch(() => ({}))) as { body?: unknown; signature?: string };
  if (!body || typeof body !== "object" || !signature) return NextResponse.json({ error: "body and signature required" }, { status: 400 });
  const { policyId } = privyIds();
  if (!policyId) return NextResponse.json({ error: "Privy is not configured" }, { status: 503 });
  try {
    await privyApi("PATCH", `/policies/${policyId}`, body, signature);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
