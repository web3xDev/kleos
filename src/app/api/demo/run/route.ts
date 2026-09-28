// The playground: our demo agent makes one real paid call and stamps it,
// streaming each step as it happens. Judges click, and watch a stamp be
// born. Funded by us; rate-limited so the demo wallet lasts.

import { Stamper, networks, payingFetch, readCountersign, readSettlement } from "kleos";
import { privateKeyToAccount } from "viem/accounts";
import { TOOL_ID } from "@/lib/demo-tool";
import { acquireDemo, busyResponse } from "@/lib/demo-lock";

export const dynamic = "force-dynamic";

type Step = { step: string; status: "start" | "done" | "error"; detail?: string; ms?: number };

export async function POST(req: Request) {
  const key = process.env.KLEOS_DEMO_RUNTIME_KEY as `0x${string}` | undefined;
  const agentId = process.env.KLEOS_DEMO_AGENT_ID;
  if (!key || !agentId) return new Response("demo not configured", { status: 503 });

  if (!acquireDemo()) return busyResponse();

  const origin = new URL(req.url).origin;
  const kleosUrl = process.env.KLEOS_URL ?? origin;
  const account = privateKeyToAccount(key);
  const network = "monad-testnet" as const;
  const stamper = new Stamper({ network, agentId: BigInt(agentId), account, kleosUrl });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const t0 = Date.now();
      const emit = (s: Step) => controller.enqueue(encoder.encode(JSON.stringify({ ...s, ms: Date.now() - t0 }) + "\n"));
      try {
        emit({ step: "agent", status: "start", detail: `Agent #${agentId} · runtime ${account.address}` });
        const paired = await stamper.isPaired();
        if (!paired) throw new Error("demo runtime is not this agent's wallet");
        emit({ step: "agent", status: "done" });

        emit({ step: "tool", status: "start", detail: "Paying and calling · awaiting settlement…" });
        const res = await payingFetch(network, account)(`${origin}/api/demo/tool`);
        const answer = await res.text();
        const settlement = readSettlement(res);
        if (!res.ok || !settlement?.success || !settlement.transaction) {
          emit({ step: "tool", status: "error", detail: !res.ok ? `tool returned ${res.status}` : "payment did not settle" });
          emit({ step: "payment", status: "error", detail: "No stamp created." });
          controller.close();
          return;
        }
        emit({ step: "tool", status: "done", detail: answer });
        const countersign = readCountersign(res);
        emit({
          step: "countersign",
          status: countersign ? "done" : "error",
          detail: countersign ? countersign.payTo : "The tool sent no countersignature.",
        });
        emit({ step: "payment", status: "done", detail: settlement.transaction });

        emit({ step: "stamp", status: "start" });
        const result = await stamper.stamp({
          tool: TOOL_ID,
          platform: "kleos-demo",
          amount: 10_000n,
          asset: networks[network].usdc,
          settlementTx: settlement.transaction,
          answer,
          meta: { source: "playground" },
          countersign,
        });
        emit({ step: "stamp", status: "done", detail: result.receiptHash });
        emit({ step: "anchor", status: "done", detail: result.anchorTx });
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
