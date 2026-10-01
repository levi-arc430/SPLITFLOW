"use client";

import { AppKit } from "@circle-fin/app-kit";
import {
  createViemAdapterFromProvider,
  type CreateViemAdapterFromProviderParams,
} from "@circle-fin/adapter-viem-v2";
import type { Connector } from "wagmi";

const kit = new AppKit();

export type CircleSendResult = {
  txHash?: `0x${string}`;
  explorerUrl?: string;
  [key: string]: unknown;
};

export async function sendUsdcWithCircle(
  connector: Connector,
  recipient: string,
  amount: string,
): Promise<CircleSendResult> {
  const provider = (await connector.getProvider()) as
    CreateViemAdapterFromProviderParams["provider"];

  const adapter = await createViemAdapterFromProvider({ provider });
  const result = await kit.send({
    from: { adapter, chain: "Arc_Testnet" },
    to: recipient,
    amount,
    token: "USDC",
  });

  return result as CircleSendResult;
}

export function extractTxHash(value: unknown): `0x${string}` | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  for (const key of ["txHash", "transactionHash", "hash"]) {
    const candidate = obj[key];
    if (typeof candidate === "string" && /^0x[a-fA-F0-9]{64}$/.test(candidate)) {
      return candidate as `0x${string}`;
    }
  }

  for (const child of Object.values(obj)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = extractTxHash(item);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = extractTxHash(child);
      if (found) return found;
    }
  }

  return null;
}
