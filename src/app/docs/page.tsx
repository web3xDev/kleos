// Developer docs. Mostly text and code, on purpose.

import Link from "next/link";
import { DEMO_AGENT_ID, DEMO_PRIVY_AGENT_ID, addresses, chain, x402Facilitator } from "@/lib/chain";
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
  ["countersign", "Tool countersignature"],
  ["pay-later", "Pay later and Kleos Engine v0"],
  ["privy", "Spending rules with Privy"],
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
              runtime learns to speak Kleos: it gets a key, the owner authorizes that key onchain, and every paid
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
              <li>
                Tools can act on those numbers. With <a href="#pay-later" className="text-primary underline decoration-transparent underline-offset-2 hover:decoration-current">pay later</a>,
                an agent whose record meets a tool&apos;s rule is served first and invoiced onchain; unpaid invoices stay visible.
              </li>
            </ul>
          </section>

          <section>
            <H2 id="quickstart">Add a track record in 10 minutes</H2>
            <p className="mt-4 text-secondary">
              1. Register an agent at <Link href="/me" className="text-primary underline-offset-2 underline decoration-transparent underline-offset-2 hover:decoration-current">kleos.finance/me</Link> with
              a passkey. That mints the ERC-8004 identity and writes the owner&apos;s encryption key next to it.
            </p>
            <p className="mt-4 text-secondary">2. In the terminal where your agent runs, pair the runtime:</p>
            <Code lang="bash">{`npx kleos-sdk pair <agentId>
# prints a pairing code, valid 4 minutes`}</Code>
            <p className="mt-4 text-secondary">
              Paste the code in Kleos → your agent → Connect runtime. The owner submits ERC-8004&apos;s{" "}
              <Mono>setAgentWallet</Mono>; the registry verifies the runtime&apos;s signature itself.
            </p>
            <p className="mt-4 text-secondary">3. In your runtime, stamp every paid call:</p>
            <Code>{`import { Stamper, payingFetch, callAndStamp, loadOrCreateRuntimeKey, networks } from "kleos-sdk";

const account = loadOrCreateRuntimeKey();            // ~/.kleos/runtime.json
const stamper = new Stamper({ agentId: ${DEMO_AGENT_ID}n, account });

const { call, stamp } = await callAndStamp({
  fetch: payingFetch("monad-testnet", account),      // pays x402 402s with the runtime key
  url: "https://example.com/paid-tool",
  tool: "example/paid-tool",
  platform: "example",
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
            <p className="mt-4 text-secondary">
              Two halves. The public receipt, whose keccak256 is the stamp&apos;s id. Version 1, signed by the runtime alone:
            </p>
            <Code lang="json">{`{
  "v": 1,
  "network": "monad-testnet",
  "agentId": "${DEMO_AGENT_ID}",
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
              Version 2 is the same receipt with the tool&apos;s side added (see{" "}
              <a href="#countersign" className="text-primary underline decoration-transparent underline-offset-2 hover:decoration-current">Tool countersignature</a>):
            </p>
            <Code lang="json">{`{
  "v": 2,
  …                                 // every version 1 field
  "payTo": "0x3082…fE34",           // where the payment went: the tool
  "paymentNonce": "0x…",            // the x402 payment's EIP-3009 nonce, seen in the settlement
  "answerCommit": "0x…",            // the tool's salted commitment to the answer it served
  "toolSignature": "0x…"            // EIP-191 by payTo over the countersign digest
}`}</Code>
            <p className="mt-4 text-secondary">
              And the private body (request, answer, a random 32-byte salt, metadata), sealed to the owner&apos;s per-agent
              public key with ECIES over secp256k1 (ephemeral ECDH → HKDF-SHA256 → AES-256-GCM). The store only ever holds
              ciphertext. The salt is why the public <Mono>answerHash</Mono> reveals nothing: without it, a short or
              predictable answer could be found by hashing candidates.
            </p>
            <p className="mt-4 text-secondary">
              Onchain, <Mono>KleosStamps.stamp()</Mono> records the receipt hash, settlement tx, tool, platform, amount and
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
              agent saying &quot;I did this&quot;; it is a pointer to a payment anyone can see onchain.
            </p>
            <p className="mt-4 text-secondary">
              The two compose. A tool that was paid can still leave standard ERC-8004 feedback about the agent (&quot;paid,
              answered&quot;) from its own address. That is a natural next step for OnchainRouter and other platforms.
            </p>
          </section>

          <section>
            <H2 id="countersign">Tool countersignature</H2>
            <p className="mt-4 text-secondary">
              A plain stamp is signed by the buyer only. When the tool countersigns, the receipt becomes two-sided: the
              runtime says &quot;I paid&quot;, the tool says &quot;I was paid for this call, and this is the answer I served&quot;.
              Such receipts are version 2.
            </p>
            <p className="mt-4 text-secondary">
              The tool signs (EIP-191) the payer, <Mono>payTo</Mono>, asset, amount, the x402 payment&apos;s EIP-3009
              <Mono> nonce</Mono>, the tool id and a salted commitment to its answer, and returns it in the
              <Mono> X-Kleos-Countersign</Mono> response header. No registry of tools is needed: a countersignature counts only
              if it was signed by the address that received the payment, and only if the settlement transaction used that
              nonce (<Mono>AuthorizationUsed</Mono>) and moved that amount from the payer to <Mono>payTo</Mono>
              (<Mono>Transfer</Mono>). It cannot be reused for another payment.
            </p>
            <p className="mt-4 text-secondary">For an x402 tool it is one call in the handler:</p>
            <Code>{`import { countersignPaidCall } from "kleos-sdk";

const answer = JSON.stringify(result);
const res = new Response(answer, { headers: { "content-type": "application/json" } });
// account = the key behind payTo
const cs = await countersignPaidCall({ account, headers: req.headers, tool: "my-tool/v1", answer });
if (cs) res.headers.set(cs.name, cs.value);
return res;`}</Code>
            <p className="mt-4 text-secondary">
              On the runtime side nothing changes: <Mono>callAndStamp</Mono> reads the header and writes a v2 receipt when the
              countersignature matches the call (payer, amount, asset, tool and answer). The tool&apos;s salt goes into the
              sealed body, so the owner can check the tool committed to the exact answer they paid for. Stamps made before
              countersigning stay valid; for them the check is &quot;not applicable&quot;.
            </p>
          </section>

          <section>
            <H2 id="pay-later">Pay later and Kleos Engine v0</H2>
            <p className="mt-4 text-secondary">
              A track record is worth something when it changes how a tool treats an agent. With pay later, a tool serves
              an agent <em>before</em> it pays, because the agent&apos;s record says it pays. The credit is onchain too: an
              invoice on <Mono>KleosCredit</Mono>, opened with the agent&apos;s consent and closed by the stamp of its
              payment together with the tool&apos;s signed acknowledgement. <Link href="/try" className="text-primary underline decoration-transparent underline-offset-2 hover:decoration-current">Try it</Link> runs
              the whole flow on testnet.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-secondary">
              <li>The agent calls the tool without paying. The tool answers 402 with its credit terms: amount, due time and its rule.</li>
              <li>The agent&apos;s runtime signs consent to be invoiced on those terms (EIP-712) and sends it in <Mono>X-Kleos-Credit</Mono>.</li>
              <li>Kleos Engine v0 reads the agent&apos;s record from Monad and applies the tool&apos;s rule.</li>
              <li>If the record qualifies, the tool opens the invoice on <Mono>KleosCredit</Mono> and serves the answer right away, with the invoice in <Mono>X-Kleos-Invoice</Mono>.</li>
              <li>The agent pays the invoice over x402. The payment is stamped and countersigned like any other, and the tool&apos;s response carries its signed &quot;I was paid for this invoice&quot; (<Mono>X-Kleos-Paid</Mono>).</li>
              <li>The stamp and that acknowledgement close the invoice on <Mono>KleosCredit</Mono>. The record gains one more verified action and a paid invoice.</li>
            </ol>

            <h3 className="mt-8 text-lg font-semibold">Kleos Engine v0</h3>
            <p className="mt-2 text-secondary">
              The engine turns the record into a decision. In v0 that decision is a rule the tool sets, applied to facts read
              from chain: how many verified actions the agent has, and how many of its invoices are overdue. Kleos supplies
              the facts; the bar is the tool&apos;s. An agent without a record asking the same tool the same thing is
              declined and pays first, like any unknown customer.
            </p>
            <Code>{`import { readAgentRecord, decideCredit } from "kleos-sdk";

const record = await readAgentRecord(publicClient, "monad-testnet", ${DEMO_AGENT_ID}n);
// { verifiedActions: 32, invoices: { total: 4, open: 0, overdue: 0, paidLate: 0 } }

const { granted, reason } = decideCredit(record, { minVerifiedActions: 20, maxOverdueInvoices: 0 });
// granted: true, reason: "32 verified actions, no unpaid invoices"`}</Code>
            <p className="mt-4 text-secondary">
              Next versions replace the fixed rule with a score from the same record: how many different tools an agent
              has paid, whether invoices were paid on time, how far back the record goes, and self-dealing patterns such as
              payments that always go to wallets the agent&apos;s owner controls.
            </p>

            <h3 className="mt-8 text-lg font-semibold">Tool side</h3>
            <p className="mt-2 text-secondary">
              <Mono>grantCredit</Mono> runs the engine, checks the request matches your terms and opens the invoice from
              your key. Declined, it opens nothing.
            </p>
            <Code>{`import { grantCredit, decodeCreditRequest, encodeCredit, CREDIT_HEADER, INVOICE_HEADER } from "kleos-sdk";

const terms = {
  v: 1, network: "monad-testnet", creditor: account.address, tool: "my-tool/v1",
  amount: "10000", asset: USDC, dueInSeconds: 300,
  rule: { minVerifiedActions: 20, maxOverdueInvoices: 0 },
};

const request = decodeCreditRequest(req.headers.get(CREDIT_HEADER));
if (!request) return Response.json({ kleosCredit: terms }, { status: 402 });

const payUrl = \`https://my-tool.xyz/invoice/\${request.invoiceId}\`;   // an x402 route for the amount
const { decision, invoice } = await grantCredit({ account, network: "monad-testnet", terms, request, payUrl });
if (!invoice) return Response.json({ kleosCredit: terms, declined: decision.reason }, { status: 402 });

return new Response(answer, { headers: { [INVOICE_HEADER]: encodeCredit(invoice) } });`}</Code>
            <p className="mt-4 text-secondary">
              On the invoice&apos;s x402 route (<Mono>payUrl</Mono>), acknowledge the payment. KleosCredit closes an invoice
              only with this signature from its creditor, and x402 only delivers the response once the payment settled:
            </p>
            <Code>{`import { acknowledgePayment } from "kleos-sdk";

const ack = await acknowledgePayment({ account, network: "monad-testnet", invoiceId, amount: invoice.amount });
res.headers.set(ack.name, ack.value);   // X-Kleos-Paid`}</Code>

            <h3 className="mt-8 text-lg font-semibold">Agent side</h3>
            <Code>{`import { requestCredit, payInvoice, encodeCredit, decodeInvoiceNotice, payingFetch, CREDIT_HEADER, INVOICE_HEADER } from "kleos-sdk";

const { kleosCredit: terms } = await (await fetch(url)).json();          // the 402 with terms
const request = await requestCredit({ account, agentId: ${DEMO_AGENT_ID}n, terms });  // signed consent

const res = await fetch(url, { headers: { [CREDIT_HEADER]: encodeCredit(request) } });
const answer = await res.text();                                          // served before payment
const invoice = decodeInvoiceNotice(res.headers.get(INVOICE_HEADER));

// Later, before invoice.dueAt: pay, stamp, close (with the tool's X-Kleos-Paid acknowledgement).
await payInvoice({
  fetch: payingFetch("monad-testnet", account), invoice, stamper, account,
  network: "monad-testnet", tool: terms.tool, platform: "my-tool", asset: terms.asset,
});`}</Code>

            <h3 className="mt-8 text-lg font-semibold">What KleosCredit enforces</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-secondary">
              <li>
                An invoice opens only with a consent signed by the agent&apos;s current <Mono>agentWallet</Mono>, an EOA or an
                ERC-1271 contract wallet (checked with OpenZeppelin&apos;s <Mono>SignatureChecker</Mono>). A tool cannot invoice an
                agent on its own.
              </li>
              <li>The due time must be in the future, and an invoice id can be used once.</li>
              <li>
                <Mono>pay(invoiceId, receiptHash, creditorSig)</Mono> closes it only with both halves of the payment: a
                KleosStamps stamp of the same agent, for at least the invoice amount, anchored after the invoice opened; and
                the creditor&apos;s EIP-712 <Mono>PaymentReceived(invoiceId, amount)</Mono>. An agent cannot close an invoice with
                a payment that went somewhere else. Each stamp pays one invoice.
              </li>
              <li>Anyone may call <Mono>pay</Mono>: the signatures are the proof, not the caller.</li>
            </ul>
            <p className="mt-4 text-secondary">
              On the profile an invoice shows as <strong className="text-primary">Open</strong> until it is due and, past due
              and unpaid, as <strong className="text-error">Unpaid</strong>. A paid one appears as the stamp that closed it,
              marked as paid later (and whether that was after the due date). Unpaid invoices stay visible to every tool that
              reads the record, and they fail a rule like the one above.
            </p>
          </section>

          <section>
            <H2 id="privy">Spending rules with Privy</H2>
            <p className="mt-4 text-secondary">
              A runtime spends money on its owner&apos;s behalf, so it needs limits it cannot lift itself. A runtime can be a
              Privy server wallet: <Mono>privyAccount</Mono> makes it a standard viem account, so stamping and x402 payments
              work unchanged, and Privy checks every signature against the wallet&apos;s policy before it signs. Anything the
              policy does not allow is refused.
            </p>
            <Code>{`import { Stamper, privyAccount, secretFromPkcs8 } from "kleos-sdk";

const account = privyAccount({ appId, appSecret, walletId, address, signerKey: secretFromPkcs8(signerKey) });
const stamper = new Stamper({ agentId: ${DEMO_PRIVY_AGENT_ID}n, account });   // every signature goes through Privy`}</Code>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-secondary">
              <li>
                <strong className="text-primary">The owner&apos;s passkey owns the rules.</strong> The wallet and its policy are
                owned by a P-256 key derived from the owner&apos;s passkey (never stored). The server signs as an additional
                signer held to the policy: it can pay and stamp within the rules, not change them.
              </li>
              <li>
                <strong className="text-primary">Changing a rule takes Touch ID.</strong> The owner edits it on the agent&apos;s
                profile; the browser signs the Privy request with the passkey-derived key (<Mono>kleos-sdk/privy-auth</Mono>)
                and the server only relays it.
              </li>
              <li>
                <strong className="text-primary">The rules are public.</strong>{" "}
                <Link href={`/a/${DEMO_PRIVY_AGENT_ID}`} className="text-primary underline decoration-transparent underline-offset-2 hover:decoration-current">
                  Agent #{DEMO_PRIVY_AGENT_ID.toString()}
                </Link>
                &apos;s profile shows them, read live from Privy (<Mono>GET /api/agents/:id/rules</Mono>).
              </li>
            </ul>
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
              <li>
                Version 2 only: recover the tool&apos;s countersignature, check it is from <Mono>payTo</Mono>, and find its nonce
                and transfer in the settlement.
              </li>
            </ol>
            <p className="mt-4 text-secondary">
              Kleos serves the receipts, but none of these checks trusts it: each one reads Monad. A receipt Kleos altered
              or invented fails them. Kleos does not decide whether a record is valid.
            </p>
            <Code>{`import { verifyReceiptSignature, receiptHash } from "kleos-sdk";

const ok = await verifyReceiptSignature(stamp.receipt);   // signature by wallet
const hash = receiptHash(publicPart);                     // compare with the anchor`}</Code>
          </section>

          <section>
            <H2 id="api">Package API</H2>
            <dl className="mt-4 space-y-5">
              {[
                ["kleos pair <agentId>", "CLI. Creates the runtime key if needed and prints a pairing code: an EIP-712 AgentWalletSet signature for the agent's current owner, valid 4 minutes."],
                ["kleos whoami", "CLI. Prints the runtime address and key path."],
                ["loadOrCreateRuntimeKey(key?)", "The runtime's account: an explicit key or KLEOS_RUNTIME_KEY (no file written), else ~/.kleos/runtime.json, created once."],
                ["new Stamper({ agentId, account, network?, kleosUrl?, ownerPublicKey? })", "One per agent. Reads the owner's encryption key from ERC-8004 metadata when not given."],
                ["stamper.stamp({ tool, platform, amount, asset, settlementTx, answer, request?, meta?, countersign? })", "Signs, seals, stores, anchors. With the tool's countersign it writes a version 2 receipt. Returns { receiptHash, anchorTx, receipt }."],
                ["stamper.isPaired()", "True while this runtime is the agent's agentWallet."],
                ["payingFetch(network, account, { maxPerCall? })", "A fetch that pays x402 402s on Monad with the runtime key. Only this network's USDC, capped per call (default 0.05)."],
                ["callAndStamp({ fetch, url, tool, platform, amount, asset, stamper })", "Call a paid tool and stamp it, countersigned when the tool sends one. No settlement, no stamp."],
                ["readCountersign(response)", "The tool's countersignature from a paid response, or null."],
                ["countersignPaidCall({ account, headers, tool, answer })", "Tool side. Countersigns a paid call; returns the header to set, or null when the request carried no payment."],
                ["readAgentRecord(publicClient, network, agentId)", "Verified actions and invoice history (open, overdue, paid late), read from chain."],
                ["decideCredit(record, rule)", "Kleos Engine v0: the tool's rule applied to a record. Returns { granted, reason }."],
                ["grantCredit({ account, network, terms, request, payUrl })", "Tool side. Runs the engine and, if granted, opens the invoice on KleosCredit."],
                ["requestCredit({ account, agentId, terms })", "Agent side. Signs consent to be invoiced on the tool's terms (EIP-712)."],
                ["privyAccount({ appId, appSecret, walletId, address, signerKey? })", "A Privy server wallet as the runtime account. Privy checks every signature against the wallet's policy; with signerKey it signs as a signer held to that policy."],
                ["authorizationSignature(key, request) · privyPublicKey(key)", "From kleos-sdk/privy-auth (browser-safe): sign a Privy request with a P-256 key, e.g. one derived from the owner's passkey, and get the public key Privy registers as owner."],
                ["acknowledgePayment({ account, network, invoiceId, amount })", "Tool side. Signs \"I was paid for this invoice\" for the paid invoice response; KleosCredit needs it to close the invoice."],
                ["payInvoice({ fetch, invoice, stamper, account, network, tool, platform, asset })", "Agent side. Pays the invoice over x402, stamps it, closes it on KleosCredit with the tool's acknowledgement."],
                ["verifyReceiptSignature(receipt) · receiptHash(pub) · answerHash(answer, salt)", "Pure helpers for verifiers."],
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
              open, 15-second cache. Every number is computed from chain; the verify endpoint runs the same five checks
              the profile runs in the browser.
            </p>
            <dl className="mt-4 space-y-5">
              {[
                ["GET /api/agents?withRecord=1&limit=50&offset=0", "Every ERC-8004 agent on the network with its Kleos stamp count. withRecord=1 keeps only agents with at least one stamp."],
                ["GET /api/agents/:id", "Identity, runtime, encryption key, track record (verifiedActions, usdcSettled, daysActive, tools, platforms), invoices from KleosCredit (open, overdue, paid, paidLate and the latest ten) and the latest ten public receipts."],
                ["GET /api/agents/:id/stamps?limit=50&offset=0", "Public receipts, newest first: tool, platform, amount, asset, settlementTx, answerHash, timestamp, signer, signature, receiptHash. Bodies are never served."],
                ["GET /api/verify/:receiptHash?agentId=", "Recomputes the hash, recovers the signer, reads the anchor from KleosStamps and fetches the settlement and, for version 2, checks the tool's countersignature. Returns valid plus the five checks."],
                ["GET /api/agents/:id/rules", "For an agent whose runtime is a Privy server wallet: the spending rules Privy enforces, read live, and whether the owner's passkey owns them."],
              ].map(([sig, desc]) => (
                <div key={sig}>
                  <dt>
                    <Mono className="text-primary">{sig}</Mono>
                  </dt>
                  <dd className="mt-1 text-sm text-secondary">{desc}</dd>
                </div>
              ))}
            </dl>
            <Code lang="bash">{`curl https://kleos.finance/api/agents/${DEMO_AGENT_ID}
# { "agent": {...}, "trackRecord": { "verifiedActions": 79, ... }, "invoices": { "total": 19, "overdue": 0, ... }, "latestStamps": [...] }

curl "https://kleos.finance/api/verify/0xa238…ed6f?agentId=${DEMO_AGENT_ID}"
# { "valid": true, "checks": [ { "label": "receiptHashRecomputed", "ok": true }, ... ] }`}</Code>
            <p className="mt-4 text-secondary">
              Kleos publishes facts; what they are worth is the caller&apos;s decision. To serve agents first and bill them
              after, see{" "}
              <a href="#pay-later" className="text-primary underline decoration-transparent underline-offset-2 hover:decoration-current">Pay later and Kleos Engine v0</a>:
              the same facts, read from chain by <Mono>readAgentRecord</Mono>, with your rule applied by{" "}
              <Mono>decideCredit</Mono>.
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
                ["KleosCredit", addresses.kleosCredit],
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
            <p className="mt-4 text-xs text-tertiary">Chain id 10143. Source: github.com/web3xDev/kleos. Package: npm install kleos-sdk.</p>
          </section>
        </article>
      </div>
    </main>
  );
}
