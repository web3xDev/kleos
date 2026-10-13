# kleos

A portable, verifiable track record for AI agents on Monad.

Every paid action an agent takes becomes a **stamp**: a receipt signed by the agent's runtime and countersigned by the tool it paid, anchored on Monad next to the x402 settlement. The record belongs to the agent's ERC-8004 identity, and anyone can verify it from chain. Tools can act on it: serve an agent first and bill it after, with the invoice onchain.

Site, docs and live demo: [kleos.finance](https://kleos.finance) · Source: [github.com/web3xDev/kleos](https://github.com/web3xDev/kleos)

```bash
npm install kleos
```

Requires Node 20+. Monad testnet only for now.

## Agent runtime: stamp every paid call

Register the agent at [kleos.finance/me](https://kleos.finance/me) with a passkey, then pair the runtime that runs it:

```bash
npx kleos pair <agentId>   # prints a pairing code, valid 4 minutes
```

Paste the code in Kleos (your agent → Connect runtime). Then, in the runtime:

```ts
import { Stamper, payingFetch, callAndStamp, loadOrCreateRuntimeKey, networks } from "kleos";

const account = loadOrCreateRuntimeKey();                 // KLEOS_RUNTIME_KEY, or ~/.kleos/runtime.json
const stamper = new Stamper({ agentId: 2233n, account });

const { stamp } = await callAndStamp({
  fetch: payingFetch("monad-testnet", account),           // pays x402 402s, capped per call
  url: "https://example.com/paid-tool",
  tool: "example/paid-tool",
  platform: "example",
  amount: 10_000n,                                         // 0.01 USDC, atomic units
  asset: networks["monad-testnet"].usdc,
  stamper,
});
// No settlement, no stamp: if the payment did not settle, stamp is null.
```

## x402 tool: countersign in one call

Tools that countersign make their receipts two-sided: "I was paid for this call, and this is the answer I served."

```ts
import { countersignPaidCall } from "kleos";

const cs = await countersignPaidCall({ account /* the key behind payTo */, headers: req.headers, tool: "my-tool/v1", answer });
if (cs) res.headers.set(cs.name, cs.value);
```

## Pay later: Kleos Engine v0

A tool reads an agent's record from chain and, by its own rule, serves it before payment. The agent's signed consent opens an invoice on KleosCredit; the stamp of its payment, with the tool's signed acknowledgement (`acknowledgePayment`, sent in `X-Kleos-Paid`), closes it.

```ts
import { readAgentRecord, decideCredit } from "kleos";

const record = await readAgentRecord(publicClient, "monad-testnet", agentId);
const { granted, reason } = decideCredit(record, { minVerifiedActions: 20, maxOverdueInvoices: 0 });
```

`grantCredit` (tool side) runs the same decision and opens the invoice; `requestCredit` and `payInvoice` (agent side) sign the consent and settle it. Full walkthrough: [kleos.finance/docs#pay-later](https://kleos.finance/docs#pay-later).

## Verify

```ts
import { verifyReceiptSignature, receiptHash } from "kleos";
```

Recompute a receipt's hash, recover its signer, then read the anchor from KleosStamps and the settlement from Monad. Nothing needs to trust Kleos.

## CLI

| Command | |
|---|---|
| `kleos pair <agentId>` | Creates the runtime key if needed and prints a pairing code for the agent's owner |
| `kleos whoami` | Prints the runtime address and where its key lives |

Pass `--key 0x…` or set `KLEOS_RUNTIME_KEY` to use an existing key instead of `~/.kleos/runtime.json`.

## Contracts (Monad testnet, chain 10143)

| | |
|---|---|
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| KleosStamps | `0x1192f1EFE2cd543C24417254B7ff488Ddb6C0F04` |
| KleosCredit | `0x5D9680B8Fdf7DC3a543A2b539d410a3EFCcb9bEE` |

## License

Apache-2.0
