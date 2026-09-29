// Keeps the demo runtime able to pay gas. Before a playground run, if the
// runtime is low on MON it gets a top-up from the drip wallet, so a burst of
// runs (judges clicking twice) never ends in "out of gas". Testnet MON only.

import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "./chain";

/** Below this the runtime is topped up (a pay-later run costs up to ~0.1 MON). */
const LOW = parseEther("0.3");
/** How much one top-up sends. */
const TOP_UP = parseEther("1");
/** The drip keeps at least this for new passkey accounts and invoice gas. */
const DRIP_FLOOR = parseEther("0.5");

let inFlight: Promise<void> | null = null;

export async function ensureRuntimeGas(runtime: `0x${string}`): Promise<void> {
  // One top-up at a time: two runs starting together must not both send.
  if (inFlight) return inFlight;
  inFlight = topUp(runtime).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function topUp(runtime: `0x${string}`): Promise<void> {
  const publicClient = createPublicClient({ chain, transport: http() });
  const balance = await publicClient.getBalance({ address: runtime });
  if (balance >= LOW) return;

  const key = process.env.DRIP_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return;
  const drip = privateKeyToAccount(key);
  const dripBalance = await publicClient.getBalance({ address: drip.address });
  if (dripBalance < TOP_UP + DRIP_FLOOR) {
    console.warn(`[demo-gas] drip too low to top up the runtime (${formatEther(dripBalance)} MON); refill it from the faucet`);
    return;
  }

  const wallet = createWalletClient({ account: drip, chain, transport: http() });
  const hash = await wallet.sendTransaction({ to: runtime, value: TOP_UP });
  await publicClient.waitForTransactionReceipt({ hash });
  console.info(`[demo-gas] topped up runtime ${runtime} with ${formatEther(TOP_UP)} MON (${hash})`);
}
