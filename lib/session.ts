import { cookies } from "next/headers";
import { recoverMessageAddress } from "viem";
import { parseAuthMessage } from "./auth-message";

const COOKIE_NAME = "splitflow_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type WalletSession = {
  message: string;
  signature: `0x${string}`;
};

export async function setSession(session: WalletSession) {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const store = await cookies();

  store.set(COOKIE_NAME, body, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export async function getSessionAddress(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const session = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    ) as WalletSession;

    if (!session.message || !session.signature) return null;

    const parsed = parseAuthMessage(session.message);
    const recovered = await recoverMessageAddress({
      message: session.message,
      signature: session.signature,
    });

    if (recovered.toLowerCase() !== parsed.wallet) return null;
    return recovered.toLowerCase();
  } catch {
    return null;
  }
}
