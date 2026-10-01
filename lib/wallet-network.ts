"use client";

import {
  ARC_EXPLORER,
  ARC_TESTNET_CHAIN_HEX,
  ARC_TESTNET_RPC,
} from "./arc";

export type BrowserProvider = {
  request(args: {
    method: string;
    params?: readonly unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
  isMetaMask?: boolean;
  providers?: BrowserProvider[];
};

function providerErrorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error && "code" in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === "number" ? value : Number(value);
  }
  return undefined;
}

export function getInjectedProvider(): BrowserProvider | null {
  if (typeof window === "undefined") return null;

  const root = (window as typeof window & { ethereum?: BrowserProvider }).ethereum;
  if (!root) return null;

  const providers = Array.isArray(root.providers) ? root.providers : [];
  return providers.find((provider) => provider.isMetaMask) ?? root;
}

export async function ensureArcTestnet(provider: BrowserProvider) {
  const current = await provider.request({ method: "eth_chainId" });
  if (
    typeof current === "string" &&
    current.toLowerCase() === ARC_TESTNET_CHAIN_HEX
  ) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET_CHAIN_HEX }],
    });
  } catch (error) {
    if (providerErrorCode(error) !== 4902) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: ARC_TESTNET_CHAIN_HEX,
          chainName: "Arc Testnet",
          nativeCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 18,
          },
          rpcUrls: [ARC_TESTNET_RPC],
          blockExplorerUrls: [ARC_EXPLORER],
        },
      ],
    });

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET_CHAIN_HEX }],
    });
  }

  // Wallets can resolve the switch request slightly before their selected
  // chain becomes observable to the dapp. Verify the provider itself.
  for (let attempt = 0; attempt < 12; attempt++) {
    const selected = await provider.request({ method: "eth_chainId" });
    if (
      typeof selected === "string" &&
      selected.toLowerCase() === ARC_TESTNET_CHAIN_HEX
    ) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }

  throw new Error(
    "Your wallet did not switch to Arc Testnet. Open the wallet network menu, select Arc Testnet, then retry.",
  );
}

export function walletErrorMessage(error: unknown, fallback: string) {
  const code = providerErrorCode(error);
  if (code === 4001) return "The wallet request was cancelled.";
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
