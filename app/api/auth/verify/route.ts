import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { parseAuthMessage } from "../../../../lib/auth-message";
import { setSession } from "../../../../lib/session";

const CHALLENGE_COOKIE = "splitflow_auth_nonce";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      message?: string;
      signature?: `0x${string}`;
    };

    if (!body.message || !body.signature) {
      return NextResponse.json({ error: "Missing message or signature" }, { status: 400 });
    }

    const parsed = parseAuthMessage(body.message);
    const expectedDomain = request.headers.get("host") || "splitflow";
    if (parsed.domain !== expectedDomain) {
      return NextResponse.json({ error: "Sign-in domain mismatch" }, { status: 400 });
    }

    const challengeNonce = request.cookies.get(CHALLENGE_COOKIE)?.value?.toLowerCase();
    if (!challengeNonce || challengeNonce !== parsed.nonce) {
      return NextResponse.json(
        { error: "Sign-in request expired. Please try again." },
        { status: 401 },
      );
    }

    const recovered = await recoverMessageAddress({
      message: body.message,
      signature: body.signature,
    });

    if (recovered.toLowerCase() !== parsed.wallet) {
      return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 });
    }

    await setSession({ message: body.message, signature: body.signature });
    const response = NextResponse.json({ address: recovered.toLowerCase() });
    response.cookies.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify wallet",
      },
      { status: 400 },
    );
  }
}
