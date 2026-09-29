// The pay-later playground. The same tool, asked for credit by two agents:
//   as: "agent"    → the demo agent (#1910), with a record: served first, then pays the invoice
//   as: "newcomer" → an agent with no record (#1909): declined, must pay first
// Streams each step as it happens, like /api/demo/run.
//
// `skipPayment` (dev only, or KLEOS_DEMO_ALLOW_DEFAULT=1) leaves the invoice
// unpaid, to show what an overdue invoice looks like on a profile.

import {
  CREDIT_HEADER,
  INVOICE_HEADER,
  Stamper,
  decodeInvoiceNotice,
  encodeCredit,
  networks,
  payInvoice,
  payingFetch,
  requestCredit,
  type CreditTerms,
} from "kleos";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { TOOL_ID } from "@/lib/demo-tool";
import { acquireDemo, busyResponse } from "@/lib/demo-lock";
import { ensureRuntimeGas } from "@/lib/demo-gas";

export const dynamic = "force-dynamic";

type Step = { step: string; status: "start" | "done" | "declined" | "error"; detail?: string; dueAt?: number };

const allowDefault = () => process.env.NODE_ENV === "development" || process.env.KLEOS_DEMO_ALLOW_DEFAULT === "1";

export async function POST(req: Request) {
  const key = process.env.KLEOS_DEMO_RUNTIME_KEY as `0x${string}` | undefined;
  const demoAgentId = process.env.KLEOS_DEMO_AGENT_ID;
  const newcomerId = process.env.KLEOS_DEMO_NEWCOMER_ID ?? "1909";
  if (!key || !demoAgentId) return new Response("demo not configured", { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { as?: "agent" | "newcomer"; skipPayment?: boolean };
  const asNewcomer = body.as === "newcomer";
  const skipPayment = Boolean(body.skipPayment) && allowDefault() && !asNewcomer;

  if (!acquireDemo()) return busyResponse();

  const origin = new URL(req.url).origin;
  const network = "monad-testnet" as const;
  // The newcomer has an ERC-8004 identity but no runtime and no stamps; a throwaway
  // key asks on its behalf. The tool looks at the record first and never gets further.
  const account = asNewcomer ? privateKeyToAccount(generatePrivateKey()) : privateKeyToAccount(key);
  const agentId = BigInt(asNewcomer ? newcomerId : demoAgentId);
  // Only the demo agent spends gas here (the newcomer is declined before any transaction).
  if (!asNewcomer) await ensureRuntimeGas(account.address).catch(() => {});

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const t0 = Date.now();
      const emit = (s: Step) => controller.enqueue(encoder.encode(JSON.stringify({ ...s, ms: Date.now() - t0 }) + "\n"));
      try {
        // 1. Ask. The tool states its terms; the agent signs consent to be invoiced on them.
        emit({ step: "ask", status: "start", detail: `Agent #${agentId} asks to pay later` });
        const termsRes = await fetch(`${origin}/api/demo/tool/credit`, { cache: "no-store" });
        const { kleosCredit: terms } = (await termsRes.json()) as { kleosCredit: CreditTerms };
        const request = await requestCredit({ account, agentId, terms });
        emit({ step: "ask", status: "done", detail: `$0.01, due in ${Math.round(terms.dueInSeconds / 60)} min · consent signed` });

        // 2. The tool reads the agent's Kleos record from chain and applies its rule.
        emit({ step: "record", status: "start", detail: `Rule: at least ${terms.rule.minVerifiedActions} verified actions, no unpaid invoices` });
        const res = await fetch(`${origin}/api/demo/tool/credit`, { headers: { [CREDIT_HEADER]: encodeCredit(request) }, cache: "no-store" });
        if (res.status !== 200) {
          const d = (await res.json().catch(() => ({}))) as { declined?: string };
          emit({ step: "record", status: "declined", detail: d.declined ?? `tool returned ${res.status}` });
          emit({ step: "declined", status: "done", detail: "No credit. This agent pays first, like any unknown customer." });
          return;
        }
        const decision = JSON.parse(Buffer.from(res.headers.get("x-kleos-decision") ?? "", "base64url").toString() || "{}") as { reason?: string };
        emit({ step: "record", status: "done", detail: decision.reason ?? "record qualifies" });

        // 3. Served before payment; the invoice is on chain.
        const answer = await res.text();
        const invoice = decodeInvoiceNotice(res.headers.get(INVOICE_HEADER));
        if (!invoice) throw new Error("tool served without an invoice");
        emit({ step: "served", status: "done", detail: answer });
        // The real due date, so the page can count down to it
        emit({ step: "invoice", status: "done", detail: invoice.openTx, dueAt: invoice.dueAt });

        if (skipPayment) {
          emit({ step: "pay", status: "declined", detail: "Not paying. The invoice stays open and turns overdue." });
          emit({ step: "done", status: "done", detail: `/a/${agentId}` });
          return;
        }

        // 4. The agent pays the invoice: x402 payment, two-sided stamp, invoice closed with it.
        emit({ step: "pay", status: "start", detail: "Paying the invoice · awaiting settlement…" });
        const stamper = new Stamper({ network, agentId, account, kleosUrl: process.env.KLEOS_URL ?? origin });
        const paid = await payInvoice({
          fetch: payingFetch(network, account),
          invoice,
          stamper,
          account,
          network,
          tool: TOOL_ID,
          platform: "kleos-demo",
          asset: networks[network].usdc,
        });
        emit({ step: "pay", status: "done", detail: paid.settlementTx });
        emit({ step: "stamp", status: "done", detail: paid.stamp.anchorTx });
        emit({ step: "close", status: "done", detail: paid.closeTx });
        emit({ step: "done", status: "done", detail: `/a/${agentId}` });
      } catch (e) {
        emit({ step: "error", status: "error", detail: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
