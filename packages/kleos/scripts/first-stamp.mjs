// End-to-end: the runtime pays the Kleos demo tool on Monad testnet and
// stamps the call. Run with the dev server up: KLEOS_URL=http://localhost:3005
import { Stamper, callAndStamp, loadOrCreateRuntimeKey, payingFetch, networks } from "../dist/index.js";

const KLEOS_URL = process.env.KLEOS_URL ?? "http://localhost:3005";
const agentId = BigInt(process.argv[2] ?? "1910");
const network = "monad-testnet";

const account = loadOrCreateRuntimeKey();
const stamper = new Stamper({ network, agentId, account, kleosUrl: KLEOS_URL });

console.log(`runtime ${account.address}, agent #${agentId}`);
console.log(`paired: ${await stamper.isPaired()}`);

const t0 = Date.now();
const result = await callAndStamp({
  fetch: payingFetch(network, account),
  url: `${KLEOS_URL}/api/demo/tool`,
  tool: "kleos-demo/monad-block",
  platform: "kleos-demo",
  amount: 10_000n,
  asset: networks[network].usdc,
  stamper,
});
console.log(`took ${Date.now() - t0} ms`);
if (result.error) {
  console.error("no stamp:", result.error);
  process.exit(1);
}
console.log("answer:", result.call.answer);
console.log("settlement tx:", result.call.settlement.transaction);
console.log("receipt hash:", result.stamp.receiptHash);
console.log("anchor tx:", result.stamp.anchorTx);
