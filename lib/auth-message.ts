import { randomUUID } from "node:crypto";

export function createAuthMessage(address: string, domain: string) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return [
    "SplitFlow wallet sign-in",
    "Wallet: " + address.toLowerCase(),
    "Domain: " + domain,
    "Nonce: " + randomUUID(),
    "Expires: " + expiresAt,
  ].join("\n");
}

export function parseAuthMessage(message: string) {
  const wallet = message.match(/^Wallet: (0x[a-fA-F0-9]{40})$/m)?.[1];
  const domain = message.match(/^Domain: (.+)$/m)?.[1];
  const expires = message.match(/^Expires: (.+)$/m)?.[1];

  if (!message.startsWith("SplitFlow wallet sign-in") || !wallet || !domain || !expires) {
    throw new Error("Invalid sign-in message");
  }
  const expiresAt = new Date(expires);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new Error("Sign-in message expired");
  }
  return { wallet: wallet.toLowerCase(), domain, expiresAt };
}
