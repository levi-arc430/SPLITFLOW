import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { createAuthMessage } from "../../../../lib/auth-message";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address") || "";
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const domain = request.headers.get("host") || "splitflow";
  return NextResponse.json({ message: createAuthMessage(address, domain) });
}
