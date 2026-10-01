import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { createAuthChallenge } from "../../../../lib/auth-message";

const CHALLENGE_COOKIE = "splitflow_auth_nonce";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address") || "";
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const domain = request.headers.get("host") || "splitflow";
  const challenge = createAuthChallenge(address, domain);
  const response = NextResponse.json({ message: challenge.message });

  response.cookies.set(CHALLENGE_COOKIE, challenge.nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });

  return response;
}
