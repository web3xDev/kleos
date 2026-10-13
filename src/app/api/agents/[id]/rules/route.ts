// GET /api/agents/:id/rules
// The spending policy Privy enforces on this agent's runtime, when its runtime
// is a Privy server wallet. Public: anyone can see what the agent may sign.

import { NextResponse } from "next/server";
import { DEMO_PRIVY_AGENT_ID } from "@/lib/chain";
import { spendingRules } from "@/lib/privy";
import { apiHeaders } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id !== DEMO_PRIVY_AGENT_ID.toString()) return NextResponse.json({ rules: null }, { headers: apiHeaders });
  const rules = await spendingRules().catch(() => null);
  return NextResponse.json({ rules }, { headers: apiHeaders });
}
