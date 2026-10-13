import { NextResponse, after } from "next/server";
import { explore, refreshing } from "@/lib/registry-scan";

export async function GET() {
  const data = await explore();
  // A refresh started behind this response (stale snapshot) finishes and is saved before the function stops.
  after(() => refreshing());
  return NextResponse.json(data, { headers: { "cache-control": "public, max-age=30" } });
}
