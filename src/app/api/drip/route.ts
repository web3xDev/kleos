// Testnet gas drip. The owner's account is derived from a passkey and starts
// empty; on testnet we top it up so registering an agent is one Touch ID, not
// "go find a faucet". Mainnet replaces this with a relayer.

import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEther, isAddress, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "@/lib/chain";

const DRIP = parseEther("0.2");
const THRESHOLD = parseEther("0.05");

// Best-effort rate limit per process; the balance threshold is the real guard.
const lastDrip = new Map<string, number>();

export async function POST(req: Request) {
  const key = process.env.DRIP_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return NextResponse.json({ error: "drip not configured" }, { status: 503 });

  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });

  const publicClient = createPublicClient({ chain, transport: http() });
  const balance = await publicClient.getBalance({ address });
  if (balance >= THRESHOLD) return NextResponse.json({ dripped: false, balance: formatEther(balance) });

  const last = lastDrip.get(address.toLowerCase()) ?? 0;
  if (Date.now() - last < 60_000) return NextResponse.json({ error: "try again in a minute" }, { status: 429 });
  lastDrip.set(address.toLowerCase(), Date.now());

  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http() });
  const hash = await wallet.sendTransaction({ to: address, value: DRIP });
  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ dripped: true, hash });
}
