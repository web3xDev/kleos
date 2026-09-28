// The same demo tool, pay later. No x402 paywall in front: an agent with a
// good enough Kleos record is served first and invoiced on KleosCredit.
//
//   no X-Kleos-Credit header  → 402 { kleosCredit: terms }       (what credit is on offer)
//   header, record too thin   → 402 { kleosCredit, declined }    (pay first instead)
//   header, record qualifies  → 200 answer + X-Kleos-Invoice      (served now, invoice opened)
//
// The rule is the tool's own (creditTerms().rule). Kleos only supplies the facts.

import { NextResponse, type NextRequest } from "next/server";
import { CREDIT_HEADER, INVOICE_HEADER, decodeCreditRequest, encodeCredit, grantCredit } from "kleos";
import { creditTerms, latestBlockAnswer, toolAccount } from "@/lib/demo-tool";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export async function GET(req: NextRequest) {
  const terms = creditTerms();
  const request = decodeCreditRequest(req.headers.get(CREDIT_HEADER));
  if (!request) return json({ kleosCredit: terms }, 402);

  const account = toolAccount();
  if (!account) return json({ error: "tool key not configured" }, 503);

  const origin = new URL(req.url).origin;
  const payUrl = `${origin}/api/demo/invoice?id=${request.invoiceId}`;
  try {
    const { decision, invoice } = await grantCredit({ account, network: terms.network, terms, request, payUrl });
    if (!decision.granted || !invoice) {
      return json({ kleosCredit: terms, declined: decision.reason, record: decision.record }, 402);
    }
    const answer = await latestBlockAnswer();
    return new NextResponse(answer, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        [INVOICE_HEADER]: encodeCredit(invoice),
        "x-kleos-decision": encodeCredit({ reason: decision.reason, record: decision.record }),
      },
    });
  } catch (e) {
    // e.g. KleosCredit rejected the consent (not signed by the agent's wallet).
    return json({ kleosCredit: terms, declined: e instanceof Error ? e.message.split("\n")[0] : String(e) }, 402);
  }
}
