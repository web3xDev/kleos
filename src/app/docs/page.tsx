// Developer docs. Mostly text and code, on purpose.

import Link from "next/link";
import { addresses, chain, x402Facilitator } from "@/lib/chain";
import { Label, Mono } from "@/components/ui";
import { MentalModel } from "@/components/mental-model";
import { DocsNav } from "@/components/docs-nav";
import { Architecture } from "@/components/architecture";
import { codeToHtml } from "shiki";

// Highlighted on the server. "min-dark" is mostly greys with a few muted
// colours, which matches the rest of the page.
async function Code({ children, lang = "ts" }: { children: string; lang?: "ts" | "bash" | "json" | "text" }) {
  const html = await codeToHtml(children, {
    lang,
    theme: "min-dark",
    transformers: [
      {
        pre(node) {
          node.properties.style = "";
          node.properties.class =
            "mt-3 overflow-auto rounded-[8px] border border-border-subtle bg-surface p-4 font-mono text-[13px] leading-relaxed";
        },
      },
    ],
  });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-[24px] font-semibold leading-tight tracking-tight">
      {children}
    </h2>
  );
}

const nav: [string, string][] = [
  ["what", "What Kleos is"],
  ["quickstart", "Add a track record in 10 minutes"],
  ["stamp", "What a stamp is"],
  ["why-not-8004", "Why not ERC-8004's Reputation Registry?"],
  ["verify", "Verifying a record"],
  ["api", "Package API"],
  ["http", "HTTP API"],
  ["architecture", "Architecture"],
  ["addresses", "Addresses"],
];

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-12 md:px-8">
      <div className="grid gap-12 md:grid-cols-[220px_1fr]">
        <DocsNav items={nav} />

        <article className="min-w-0 space-y-16">
          <header>
            <h1 className="text-[40px] font-semibold leading-none tracking-tight">Give your agent a track record.</h1>
            <p className="mt-4 text-lg text-secondary">Add Kleos to an existing agent runtime in minutes.</p>
            <p className="mt-6 text-secondary">
              <strong className="text-primary">Kleos does not install anything inside your agent.</strong> Your agent&apos;s
              runtime learns to speak Kleos: it gets a key, the owner authorizes that key on chain, and every paid
              action the runtime makes becomes a stamp.
            </p>
          </header>

          <section>
            <H2 id="what">What Kleos is</H2>
            <p className="mt-4 text-secondary">
              A portable reputation layer for AI agents. An agent is an ERC-8004 identity on Monad, owned by a human&apos;s
              passkey. Its runtime (the software that actually runs it) is registered as the agent&apos;s wallet. Every
              x402 payment the runtime makes produces a signed receipt whose hash is anchored on Monad next to the
              settlement. Those anchors are the agent&apos;s track record: verified actions, USDC settled, days active,
              tools and platforms used. Anyone can recompute them from chain. No platform owns them.
            </p>
            <div className="mt-6 rounded-[10px] border border-border bg-surface p-5">
              <Label>The model</Label>
              <div className="mt-4">
                <MentalModel />
              </div>
            </div>
            <ul className="mt-6 list-disc space-y-2 pl-5 text-secondary">
              <li>A stamp exists only when a payment settled. It cannot be faked without paying.</li>
              <li>The receipt body (the answer) is encrypted to the owner&apos;s passkey-derived key. Kleos cannot read it.</li>
              <li>Authorization is ERC-8004&apos;s own <Mono>agentWallet</Mono>. Revoking is standard; old stamps stay verifiable.</li>
              <li>There is no score. There are numbers anyone can check.</li>
            </ul>
          </section>

          <section>
            <H2 id="quickstart">Add a track record in 10 minutes</H2>
            <p className="mt-4 text-secondary">
              1. Register an agent at <Link href="/me" className="text-primary underline-offset-2 underline decoration-transparent underline-offset-2 hover:decoration-current">kleos.xyz/me</Link> with
              a passkey. That mints the ERC-8004 identity and writes the owner&apos;s encryption key next to it.
            </p>
            <p className="mt-4 text-secondary">2. In the terminal where your agent runs, pair the runtime:</p>
            <Code lang="bash">{`npx kleos pair <agentId>
# prints a pairing code, valid 4 minutes`}</Code>
            <p className="mt-4 text-secondary">
              Paste the code in Kleos → your agent → Connect runtime. The owner submits ERC-8004&apos;s{" "}
              <Mono>setAgentWallet</Mono>; the registry verifies the runtime&apos;s signature itself.
            </p>
            <p className="mt-4 text-secondary">3. In your runtime, stamp every paid call:</p>
            <Code>{`import { Stamper, payingFetch, callAndStamp, loadOrCreateRuntimeKey, networks } from "kleos";

const account = loadOrCreateRuntimeKey();            // ~/.kleos/runtime.json
const stamper = new Stamper({ agentId: 1910n, account });

const { call, stamp } = await callAndStamp({
  fetch: payingFetch("monad-testnet", account),      // pays x402 402s with the runtime key
  url: "https://onchainrouter.io/tools/lending-rates",
  tool: "onchainrouter/lending-rates",
  platform: "onchainrouter",
  amount: 10_000n,                                    // 0.01 USDC, atomic units
  asset: networks["monad-testnet"].usdc,
  stamper,
});

// stamp.receiptHash is anchored on Monad; stamp.receipt is the signed public part.
// If the payment did not settle, stamp is null and nothing is recorded.`}</Code>
            <p className="mt-4 text-secondary">
              Already have an x402-paying fetch? Skip <Mono>payingFetch</Mono> and call <Mono>stamper.stamp()</Mono> yourself
              after each settled response, passing the settlement transaction from the <Mono>PAYMENT-RESPONSE</Mono> header.
            </p>
          </section>

          <section>
            <H2 id="stamp">What a stamp is</H2>
            <p className="mt-4 text-secondary">Two halves. The public receipt, whose keccak256 is the stamp&apos;s id:</p>
            <Code lang="json">{`{
  "v": 1,
  "network": "monad-testnet",
  "agentId": "1910",
  "wallet": "0x3539…8b68",          // runtime signer, must equal ERC-8004 agentWallet
  "tool": "kleos-demo/monad-block",
  "platform": "kleos-demo",
  "amount": "10000",                // atomic units
  "asset": "0x534b…43A3",           // USDC
  "settlementTx": "0x2a4b…31b72",   // the x402 settlement on Monad
  "answerHash": "0xb79b…cac1",      // keccak256(salt || answer); the salt is in the sealed body
  "timestamp": 1790001139,
  "signature": "0x…"                // EIP-191 by wallet over the receipt hash
}`}</Code>
            <p className="mt-4 text-secondary">
              And the private body (request, answer, a random 32-byte salt, metadata), sealed to the owner&apos;s per-agent
              public key with ECIES over secp256k1 (ephemeral ECDH → HKDF-SHA256 → AES-256-GCM). The store only ever holds
              ciphertext. The salt is why the public <Mono>answerHash</Mono> reveals nothing: without it, a short or
              predictable answer could be found by hashing candidates.
            </p>
            <p className="mt-4 text-secondary">
              On chain, <Mono>KleosStamps.stamp()</Mono> records the receipt hash, settlement tx, tool, platform, amount and
              signer, and reverts unless <Mono>msg.sender</Mono> is the agent&apos;s <Mono>agentWallet</Mono> and the settlement
              is non-zero.
            </p>
          </section>

          <section>
            <H2 id="why-not-8004">Why not ERC-8004&apos;s Reputation Registry?</H2>
            <p className="mt-4 text-secondary">
              ERC-8004 answers &quot;who is this agent&quot;. Its Reputation Registry lets a <em>client</em> leave feedback about an
              agent that served it, and it explicitly rejects feedback from the agent&apos;s own owner or operators
              (&quot;prevent self-feedback&quot;). A Kleos receipt is produced by the agent&apos;s own runtime, about the agent&apos;s
              own purchase. Under the standard that is self-feedback, and it reverts.
            </p>
            <p className="mt-4 text-secondary">
              So Kleos keeps the identity in ERC-8004 and adds one contract for what the standard does not model: a
              <strong className="text-primary"> settled-payment-backed execution receipt</strong>. KleosStamps stores structured
              fields (settlement transaction, amount, tool, platform, signer) instead of a score or free text, requires a
              non-zero settlement, and only accepts the wallet the registry lists as the agent&apos;s. The stamp is not the
              agent saying &quot;I did this&quot;; it is a pointer to a payment anyone can see on chain.
            </p>
            <p className="mt-4 text-secondary">
              The two compose. A tool that was paid can still leave standard ERC-8004 feedback about the agent (&quot;paid,
              answered&quot;) from its own address. That is a natural next step for OnchainRouter and other platforms.
            </p>
          </section>

          <section>
            <H2 id="verify">Verifying a record</H2>
            <p className="mt-4 text-secondary">
              The profile page&apos;s &quot;Verify this profile&quot; runs in your browser against Monad. For each stamp:
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-secondary">
              <li>Recompute the receipt hash from the public fields (fixed key order, no whitespace).</li>
              <li>Recover the EIP-191 signer and check it equals the receipt&apos;s wallet.</li>
              <li>Read <Mono>KleosStamps.getStamp(hash)</Mono>: agent id, settlement, amount and wallet must match.</li>
              <li>Fetch the settlement transaction receipt: it must have succeeded and touched the asset contract.</li>
            </ol>
            <p className="mt-4 text-secondary">
              Kleos&apos;s API is not consulted. Kleos does not decide whether a record is valid.
            </p>
            <Code>{`import { verifyReceiptSignature, receiptHash } from "kleos";

const ok = await verifyReceiptSignature(stamp.receipt);   // signature by wallet
const hash = receiptHash(publicPart);                     // compare with the anchor`}</Code>
          </section>

          <section>
            <H2 id="api">Package API</H2>
            <dl className="mt-4 space-y-5">
              {[
                ["kleos pair <agentId>", "CLI. Creates the runtime key if needed and prints a pairing code: an EIP-712 AgentWalletSet signature for the agent's current owner, valid 4 minutes."],
                ["kleos whoami", "CLI. Prints the runtime address and key path."],
                ["new Stamper({ agentId, account, network?, kleosUrl?, ownerPublicKey? })", "One per agent. Reads the owner's encryption key from ERC-8004 metadata when not given."],
                ["stamper.stamp({ tool, platform, amount, asset, settlementTx, answer, request?, meta? })", "Signs, seals, stores, anchors. Returns { receiptHash, anchorTx, receipt }."],
                ["stamper.isPaired()", "True while this runtime is the agent's agentWallet."],
                ["payingFetch(network, account, { maxPerCall? })", "A fetch that pays x402 402s on Monad with the runtime key. Only this network's USDC, capped per call (default 0.05)."],
                ["callAndStamp({ fetch, url, tool, platform, amount, asset, stamper })", "Call a paid tool and stamp it. No settlement, no stamp."],
                ["verifyReceiptSignature(receipt) · receiptHash(pub) · answerHash(answer)", "Pure helpers for verifiers."],
                ["seal(bytes, publicKey) · open(sealed, privateKey)", "The receipt-body encryption, for runtimes and owners."],
              ].map(([sig, desc]) => (
                <div key={sig}>
                  <dt>
                    <Mono className="text-primary">{sig}</Mono>
                  </dt>
                  <dd className="mt-1 text-sm text-secondary">{desc}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <H2 id="http">HTTP API</H2>
            <p className="mt-4 text-secondary">
              For applications that want to read an agent&apos;s record without a wallet library. Public, no key, CORS
              open, 15-second cache. Every number is computed from chain; the verify endpoint runs the same four checks
              the profile runs in the browser.
            </p>
            <dl className="mt-4 space-y-5">
              {[
                ["GET /api/agents?withRecord=1&limit=50&offset=0", "Every ERC-8004 agent on the network with its Kleos stamp count. withRecord=1 keeps only agents with at least one stamp."],
                ["GET /api/agents/:id", "Identity, runtime, encryption key, track record (verifiedActions, usdcSettled, daysActive, tools, platforms) and the latest ten public receipts."],
                ["GET /api/agents/:id/stamps?limit=50&offset=0", "Public receipts, newest first: tool, platform, amount, asset, settlementTx, answerHash, timestamp, signer, signature, receiptHash. Bodies are never served."],
                ["GET /api/verify/:receiptHash?agentId=", "Recomputes the hash, recovers the signer, reads the anchor from KleosStamps and fetches the settlement. Returns valid plus the four checks."],
              ].map(([sig, desc]) => (
                <div key={sig}>
                  <dt>
                    <Mono className="text-primary">{sig}</Mono>
                  </dt>
                  <dd className="mt-1 text-sm text-secondary">{desc}</dd>
                </div>
              ))}
            </dl>
            <Code lang="bash">{`curl https://kleos.xyz/api/agents/1910
# { "agent": {...}, "trackRecord": { "verifiedActions": 11, "usdcSettled": "110000", ... }, "latestStamps": [...] }

curl "https://kleos.xyz/api/verify/0xa238…ed6f?agentId=1910"
# { "valid": true, "checks": [ { "label": "receiptHashRecomputed", "ok": true }, ... ] }`}</Code>
            <p className="mt-4 text-secondary">
              A gate is one line: <Mono>if (trackRecord.verifiedActions &gt;= 50) allowDeferredSettlement()</Mono>. Kleos publishes facts; what
              they are worth is the caller&apos;s decision.
            </p>
          </section>

          <section>
            <H2 id="architecture">Architecture</H2>
            <div className="mt-4">
              <Architecture />
            </div>
            <p className="mt-4 text-secondary">
              Two things never exist: a Kleos-held key, and a stamp without a payment. The store (receipt bodies) is
              untrusted; the registry and KleosStamps are the source of truth.
            </p>
          </section>

          <section>
            <H2 id="addresses">Addresses ({chain.name})</H2>
            <dl className="mt-4 space-y-3">
              {[
                ["ERC-8004 Identity Registry", addresses.identityRegistry],
                ["ERC-8004 Reputation Registry", addresses.reputationRegistry],
                ["KleosStamps", addresses.kleosStamps],
                ["USDC", addresses.usdc],
                ["x402 facilitator", x402Facilitator],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-sm text-secondary">{label}</dt>
                  <dd>
                    <Mono className="text-primary">{value}</Mono>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-tertiary">Chain id 10143. Source: github.com/web3xDev/kleos. Package: npm install kleos.</p>
          </section>
        </article>
      </div>
    </main>
  );
}
