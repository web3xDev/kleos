// Launch reset helper for the demo agent's runtime wallet. Run from kleos/:
//
//   node scripts/demo-runtime.mjs status            balances of the current runtime (KLEOS_DEMO_RUNTIME_KEY)
//   node scripts/demo-runtime.mjs new               a fresh runtime key: prints its address and key
//   node scripts/demo-runtime.mjs fund <address>    moves all USDC from the current runtime to <address>
//   node scripts/demo-runtime.mjs fund <address> 2  moves 2 USDC only
//
// Reads KLEOS_DEMO_RUNTIME_KEY from the environment or .env.local (only that
// variable). Gas for the new runtime is not needed here: the demo routes top it
// up from the drip wallet before each run.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, isAddress, parseAbi, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

async function envVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    const env = await readFile(join(process.cwd(), ".env.local"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
const balances = async (address) => {
  const [mon, usdc] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [address] }),
  ]);
  return { mon, usdc };
};

async function currentRuntime() {
  const key = await envVar("KLEOS_DEMO_RUNTIME_KEY");
  if (!key) {
    console.error("KLEOS_DEMO_RUNTIME_KEY is not set (environment or .env.local).");
    process.exit(1);
  }
  return privateKeyToAccount(key);
}

const [cmd, arg, amountArg] = process.argv.slice(2);

if (cmd === "new") {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  console.log(`address  ${account.address}`);
  console.log(`key      ${key}`);
  console.log("\nKeep the key private. Fund this address first (fund), then put the key in KLEOS_DEMO_RUNTIME_KEY.");
} else if (cmd === "status") {
  const account = await currentRuntime();
  const b = await balances(account.address);
  console.log(`runtime  ${account.address}`);
  console.log(`MON      ${formatEther(b.mon)}`);
  console.log(`USDC     ${formatUnits(b.usdc, 6)}  (${Number(b.usdc / 10_000n)} paid actions at $0.01)`);
} else if (cmd === "fund") {
  if (!arg || !isAddress(arg)) {
    console.error("usage: node scripts/demo-runtime.mjs fund <newRuntimeAddress>");
    process.exit(2);
  }
  const account = await currentRuntime();
  if (account.address.toLowerCase() === arg.toLowerCase()) {
    console.error("That is the current runtime itself. Run fund before switching KLEOS_DEMO_RUNTIME_KEY to the new key.");
    process.exit(2);
  }
  const { usdc: held } = await balances(account.address);
  const usdc = amountArg ? parseUnits(amountArg, 6) : held;
  if (usdc === 0n || usdc > held) {
    console.error(`The current runtime ${account.address} holds ${formatUnits(held, 6)} USDC; cannot move ${formatUnits(usdc, 6)}.`);
    process.exit(1);
  }
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
  const hash = await wallet.writeContract({ address: USDC, abi: erc20, functionName: "transfer", args: [arg, usdc] });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`moved ${formatUnits(usdc, 6)} USDC  ${account.address} -> ${arg}`);
  console.log(`tx ${monadTestnet.blockExplorers.default.url}/tx/${hash}`);
} else {
  console.error("usage: node scripts/demo-runtime.mjs <status | new | fund <address>>");
  process.exit(2);
}
