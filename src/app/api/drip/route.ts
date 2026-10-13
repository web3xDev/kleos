// Testnet gas drip. The owner's account is derived from a passkey and starts
// empty; on testnet we top it up so registering an agent is one Touch ID, not
// "go find a faucet". Mainnet replaces this with a relayer.

import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, parseEther, isAddress, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, serverTransport } from "@/lib/chain";
import { checkDripLimits, ipKey, recordDrip } from "@/lib/drip-limits";

const DRIP = parseEther("0.2");
const THRESHOLD = parseEther("0.05");
// Never drip below this: the demo agent's runtime is topped up from the same
// wallet (see demo-gas.ts: one 1 MON top-up plus its 0.5 MON floor).
const RESERVE = parseEther("1.5");

export async function POST(req: Request) {
  const key = process.env.DRIP_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return NextResponse.json({ error: "drip not configured" }, { status: 503 });

  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });

  const publicClient = createPublicClient({ chain, transport: serverTransport() });
  const balance = await publicClient.getBalance({ address });
  if (balance >= THRESHOLD) return NextResponse.json({ dripped: false, balance: formatEther(balance) });

  // Limits per account, per network (hashed IP) and per day, counted from durable records.
  const ip = ipKey(req);
  const refused = await checkDripLimits(address, ip);
  if (refused) return NextResponse.json({ error: refused }, { status: 429 });

  const account = privateKeyToAccount(key);
  const dripBalance = await publicClient.getBalance({ address: account.address });
  if (dripBalance < DRIP + RESERVE) {
    console.warn(`[drip] below reserve (${formatEther(dripBalance)} MON); refill it from the faucet`);
    return NextResponse.json({ error: "Testnet gas is running low. Try again later." }, { status: 503 });
  }

  // Recorded before sending, so parallel calls see each other.
  await recordDrip(address, ip);

  const wallet = createWalletClient({ account, chain, transport: serverTransport() });
  const hash = await wallet.sendTransaction({ to: address, value: DRIP });
  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ dripped: true, hash });
}
