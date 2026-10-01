import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { parseAuthMessage } from "../../../../lib/auth-message";
import { setSession } from "../../../../lib/session";

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

    const recovered = await recoverMessageAddress({
      message: body.message,
      signature: body.signature,
    });

    if (recovered.toLowerCase() !== parsed.wallet) {
      return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 });
    }

    await setSession(recovered);
    return NextResponse.json({ address: recovered.toLowerCase() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify wallet" },
      { status: 400 },
    );
  }
}
