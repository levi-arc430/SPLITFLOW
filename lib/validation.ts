export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function safeServerMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.toLowerCase();
  if (
    message.includes("database_url") ||
    message.includes("session_secret") ||
    message.includes("postgres") ||
    message.includes("neon") ||
    message.includes("connection") ||
    message.includes("sql")
  ) {
    return fallback;
  }

  return error.message;
}
