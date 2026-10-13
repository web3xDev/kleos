// POST /api/privy/lock  { publicKey, signature }
// Makes a P-256 key derived from the agent owner's passkey the owner of the
// Privy agent's wallet and of its spending policy, and adds the server as a
// signer held to that policy. From then on only the passkey can change the
// rules; the app secret alone cannot.
//
// Only the agent's ERC-8004 owner may do this: `signature` is that owner's
// EIP-191 signature over lockMessage(agentId, publicKey).

import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { DEMO_PRIVY_AGENT_ID, addresses } from "@/lib/chain";
import { identityRegistryAbi } from "@/lib/erc8004";
import { publicClient } from "@/lib/api";
import { privyApi, privyIds } from "@/lib/privy";
import { lockMessage } from "@/lib/privy-lock";

export async function POST(req: Request) {
  const { publicKey, signature } = (await req.json().catch(() => ({}))) as { publicKey?: string; signature?: `0x${string}` };
  if (!publicKey || !/^[A-Za-z0-9+/=]{80,}$/.test(publicKey) || !signature) {
    return NextResponse.json({ error: "publicKey and signature required" }, { status: 400 });
  }
  const { walletId, policyId, signerId } = privyIds();
  if (!walletId || !policyId || !signerId) return NextResponse.json({ error: "Privy is not configured" }, { status: 503 });

  const owner = await publicClient.readContract({
    address: addresses.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "ownerOf",
    args: [DEMO_PRIVY_AGENT_ID],
  });
  const valid = await verifyMessage({ address: owner, message: lockMessage(DEMO_PRIVY_AGENT_ID, publicKey), signature }).catch(() => false);
  if (!valid) return NextResponse.json({ error: "Only the agent's owner can lock its rules." }, { status: 403 });

  try {
    // The policy first: once the wallet has an owner, unowned resources are the weak link.
    await privyApi("PATCH", `/policies/${policyId}`, { owner: { public_key: publicKey } });
    await privyApi("PATCH", `/wallets/${walletId}`, {
      owner: { public_key: publicKey },
      additional_signers: [{ signer_id: signerId, override_policy_ids: [policyId] }],
    });
  } catch (e) {
    // Already owned: Privy refuses an ownership change without the current owner's signature.
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
