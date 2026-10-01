import { defineChain, erc20Abi } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_TESTNET_RPC =
  process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io";

export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
    "0x3600000000000000000000000000000000000000") as `0x${string}`;

export const USDC_DECIMALS = 6;
export const ARC_EXPLORER = "https://explorer.testnet.arc.io";

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  blockExplorers: { default: { name: "Arc Explorer", url: ARC_EXPLORER } },
});

export const usdcAbi = erc20Abi;
