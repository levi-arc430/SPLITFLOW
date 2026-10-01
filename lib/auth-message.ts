import { randomUUID } from "node:crypto";

export function createAuthChallenge(address: string, domain: string) {
  const nonce = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const message = [
    "SplitFlow wallet sign-in",
    "Wallet: " + address.toLowerCase(),
    "Domain: " + domain,
    "Nonce: " + nonce,
    "Expires: " + expiresAt,
  ].join("\n");

  return { message, nonce, expiresAt };
}

export function parseAuthMessage(message: string) {
  const wallet = message.match(/^Wallet: (0x[a-fA-F0-9]{40})$/m)?.[1];
  const domain = message.match(/^Domain: (.+)$/m)?.[1];
  const nonce = message.match(/^Nonce: ([0-9a-f-]{36})$/mi)?.[1];
  const expires = message.match(/^Expires: (.+)$/m)?.[1];

  if (
    !message.startsWith("SplitFlow wallet sign-in") ||
    !wallet ||
    !domain ||
    !nonce ||
    !expires
  ) {
    throw new Error("Invalid sign-in message");
  }

  const expiresAt = new Date(expires);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new Error("Sign-in message expired");
  }

  return {
    wallet: wallet.toLowerCase(),
    domain,
    nonce: nonce.toLowerCase(),
    expiresAt,
  };
}
