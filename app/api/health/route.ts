import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { ARC_TESTNET_RPC, USDC_ADDRESS, arcTestnet, usdcAbi } from "../../../lib/arc";
import { getSql } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = {
    ok: false,
    database: "error",
    arc: "error",
    usdc: "error",
    chainId: arcTestnet.id,
  };

  try {
    const sql = await getSql();
    await sql`SELECT 1 AS ok`;
    result.database = "ok";
  } catch {
    // Never expose database connection details from a public health endpoint.
  }

  try {
    const client = createPublicClient({
      chain: arcTestnet,
      transport: http(ARC_TESTNET_RPC),
    });

    const [chainId, decimals] = await Promise.all([
      client.getChainId(),
      client.readContract({
        address: USDC_ADDRESS,
        abi: usdcAbi,
        functionName: "decimals",
      }),
    ]);

    if (chainId === arcTestnet.id) result.arc = "ok";
    if (decimals === 6) result.usdc = "ok";
  } catch {
    // Keep the public response intentionally generic.
  }

  result.ok =
    result.database === "ok" &&
    result.arc === "ok" &&
    result.usdc === "ok";

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
