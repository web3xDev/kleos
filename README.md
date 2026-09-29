# Kleos

**A portable, verifiable payment history for AI agents.** Every paid action an agent takes leaves a *stamp*: a receipt signed by the agent and countersigned by the tool it paid, anchored on Monad next to the settled payment. The record belongs to the agent's ERC-8004 identity, not to any platform, and anyone can verify it without trusting Kleos.

Tools use that history to decide how far to trust an agent, for example serving it first and getting paid after. That credit is on chain too: invoices are opened with the agent's consent and closed by the stamp of the payment, and unpaid ones stay visible.

> Built for **Monad Metropolis**, Track 4: Trust, Identity & AI Infrastructure. Everything runs on **Monad Testnet**.

---

## Why

Agents already have identity ([ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)) and money ([x402](https://www.x402.org)). What they do not have is a history.

- An agent's track record sits in the database of whichever platform ran it. Move platforms, start from zero.
- A new platform cannot verify another platform's claims.
- Ratings and reviews are cheap to fake.

On Monad testnet about 1,950 agents are registered in ERC-8004. One has a verifiable history. Kleos is that missing layer.

**What Kleos does not do:** it gives no score and makes no decision. It keeps facts (verified actions, USDC settled, days active, invoices paid or unpaid) that any risk engine can read and apply its own rule to. It does not make faking impossible; it makes it expensive (every stamp costs a real payment) and visible (every payment is public).

## How it works

```
Owner (passkey) ──register──▶ ERC-8004 identity ◀──setAgentWallet── Runtime key (pairing)
                                                                        │
                                   pays a tool over x402 ───────────────┤
                                                                        ▼
            Tool countersigns ──▶ receipt (EIP-191, both sides) ──▶ KleosStamps.stamp()   (hash on Monad)
                                  answer sealed to the owner (ECIES)  ─▶ Kleos store     (ciphertext only)
```

1. **Register.** The owner signs in with a passkey (Touch ID). Keys are derived from the passkey's PRF output ([Mera](https://www.npmjs.com/package/@category-labs/mera)): no seed phrase, no wallet, nothing stored. The agent gets an ERC-8004 identity with the owner's encryption key as metadata.
2. **Pair.** The runtime that runs the agent generates its own key and a pairing code. The owner approves it once; ERC-8004's `setAgentWallet` records it. Revocable any time.
3. **Act.** The agent pays a tool over x402; the payment settles in USDC on Monad.
4. **Stamp.** The runtime signs a receipt (tool, amount, settlement tx, salted answer hash). The tool countersigns: *"I was paid for this call, and this is the answer I served."* The receipt hash is anchored on `KleosStamps`; the answer is encrypted to the owner.
5. **Verify.** Anyone recomputes the hash, checks both signatures, reads the anchor and the settlement from Monad. The profile page does this in the browser; Kleos is not consulted.
6. **Pay later.** A tool reads the agent's record from chain and, by its own rule, serves first. The agent's signed consent opens an invoice on `KleosCredit`; the stamp of its payment closes it. Past due and unpaid, it shows on the profile in red.

## What is in this repo

| Path | What |
|---|---|
| `src/` | The site (Next.js 16): landing, Explore (network map), Try (live demo), agent profiles, My agents (passkey), Docs, public API |
| `packages/kleos/` | The `kleos` npm package: pairing, `Stamper`, `payingFetch`, `callAndStamp`, tool countersigning, credit (`requestCredit`, `grantCredit`, `payInvoice`), CLI |
| `contracts/` | Foundry: `KleosStamps` and `KleosCredit`, with tests |
| `indexer/` | Envio HyperIndex indexer: ERC-8004 agents, stamps and invoices as a GraphQL API |

## Contracts (Monad Testnet, chain 10143)

| Contract | Address |
|---|---|
| ERC-8004 Identity Registry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadvision.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| KleosStamps | [`0xb63DE9add37AF3Edd48Db8C1555578e6C1A8Cb18`](https://testnet.monadvision.com/address/0xb63DE9add37AF3Edd48Db8C1555578e6C1A8Cb18) |
| KleosCredit | [`0xa5314F72F599412763b03D47150Bb7Ed5E166B43`](https://testnet.monadvision.com/address/0xa5314F72F599412763b03D47150Bb7Ed5E166B43) |
| USDC (x402 asset) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |

## Use it

**Agent runtime: stamp every paid call.**

```bash
npx kleos pair <agentId>   # prints a pairing code; the owner approves it in Kleos
```

```ts
import { Stamper, payingFetch, callAndStamp, loadOrCreateRuntimeKey, networks } from "kleos";

const account = loadOrCreateRuntimeKey();                 // ~/.kleos/runtime.json
const stamper = new Stamper({ agentId: 1910n, account });

const { stamp } = await callAndStamp({
  fetch: payingFetch("monad-testnet", account),           // pays x402 402s with the runtime key
  url: "https://example.com/paid-tool",
  tool: "example/paid-tool",
  platform: "example",
  amount: 10_000n,                                         // 0.01 USDC, atomic units
  asset: networks["monad-testnet"].usdc,
  stamper,
});
// No settlement, no stamp: if the payment did not settle, stamp is null.
```

**x402 tool: countersign in one call.** Works with any x402 tool; tools that add this get two-sided receipts.

```ts
import { countersignPaidCall } from "kleos";

const cs = await countersignPaidCall({ account /* key behind payTo */, headers: req.headers, tool: "my-tool/v1", answer });
if (cs) res.headers.set(cs.name, cs.value);
```

**Tool: serve first for agents with a record.**

```ts
import { grantCredit, readAgentRecord, decideCredit } from "kleos";

// Facts from chain; the rule is yours.
const record = await readAgentRecord(publicClient, "monad-testnet", agentId);
const { granted, reason } = decideCredit(record, { minVerifiedActions: 20, maxOverdueInvoices: 0 });
```

Full reference: `/docs` on the site.

**Public HTTP API** (read only, CORS open): `GET /api/agents`, `GET /api/agents/:id`, `GET /api/agents/:id/stamps`, `GET /api/verify/:receiptHash?agentId=`.

## Run it locally

```bash
npm install
npm run dev -- -p 3005
```

Environment (`.env.local`):

| Variable | Purpose |
|---|---|
| `DRIP_PRIVATE_KEY` | Funds new passkey accounts with testnet gas; also the demo tool's key |
| `KLEOS_PAY_TO` | Where demo tool payments go (the address of the key above) |
| `KLEOS_DEMO_RUNTIME_KEY` | The demo agent's runtime key (paired to `KLEOS_DEMO_AGENT_ID`) |
| `KLEOS_DEMO_AGENT_ID` | The demo agent, `1910` |
| `KLEOS_URL` | Base URL of the stamp store (defaults to the site itself) |
| `BLOB_READ_WRITE_TOKEN` | Optional: Vercel Blob for the stamp store (local files otherwise) |

Passkey sign-in needs a platform authenticator with the WebAuthn PRF extension: iCloud Keychain (Safari, and Chromium browsers on macOS) or Google Password Manager.

Contracts: `cd contracts && forge test`. Indexer: see `indexer/config.yaml` (deployed on Envio's hosted service).

## Sponsor tech

- **Mera**: passkey PRF, two salts in one ceremony, per-agent keys derived in memory. No seed phrase, no server secret.
- **Envio**: HyperIndex over ERC-8004, KleosStamps and KleosCredit on Monad testnet, so the chain (not Kleos's store) is the source of every list.

## Limits, stated plainly

- Testnet only.
- A stamp proves a paid action happened and what was paid; it does not grade the quality of the work.
- An agent paying a tool it controls can inflate its own record. That costs real payments and leaves a public trail; no system can rule it out.
- Earlier stamps (before countersigning) are one-sided; they verify, with the countersignature check marked "not applicable".

## License

- **The site** (everything outside the folders below) is [AGPL-3.0](LICENSE): open to read and run, and anyone who offers a modified version as a service must publish their changes.
- **The protocol pieces** are [MIT](packages/kleos/LICENSE), so anyone can build on them without restriction: the `kleos` package (`packages/kleos`), the contracts (`contracts`) and the indexer (`indexer`).
