import { NextResponse } from "next/server";
import { explore } from "@/lib/registry-scan";

export async function GET() {
  const data = await explore();
  return NextResponse.json(data, { headers: { "cache-control": "public, max-age=30" } });
}
