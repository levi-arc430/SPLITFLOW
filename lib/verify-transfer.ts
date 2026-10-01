import {
  createPublicClient,
  decodeEventLog,
  http,
  parseUnits,
  type Hash,
} from "viem";
import { ARC_TESTNET_RPC, USDC_ADDRESS, arcTestnet, usdcAbi } from "./arc";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC),
});

export async function verifyUsdcTransfer(input: {
  txHash: string;
  from: string;
  to: string;
  amount: string;
}) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) {
    throw new Error("Invalid transaction hash");
  }

  const hash = input.txHash as Hash;
  const receipt = await client.getTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("Transaction failed");
  }

  const expectedFrom = input.from.toLowerCase();
  const expectedTo = input.to.toLowerCase();
  const expectedAmount = parseUnits(input.amount, 6);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue;

    try {
      const decoded = decodeEventLog({
        abi: usdcAbi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as {
        from?: string;
        to?: string;
        value?: bigint;
      };

      if (
        args.from?.toLowerCase() === expectedFrom &&
        args.to?.toLowerCase() === expectedTo &&
        args.value === expectedAmount
      ) {
        return { hash, blockNumber: receipt.blockNumber };
      }
    } catch {
      // Ignore unrelated USDC events and keep scanning the receipt.
    }
  }

  // Arc also exposes USDC as the network's native gas asset. Keep a strict
  // native-transfer fallback in case a wallet chooses that path.
  const tx = await client.getTransaction({ hash });

  if (
    tx.from.toLowerCase() === expectedFrom &&
    tx.to?.toLowerCase() === expectedTo
  ) {
    const expectedNativeAmount = parseUnits(input.amount, 18);
    if (tx.value === expectedNativeAmount) {
      return { hash, blockNumber: receipt.blockNumber };
    }
  }

  throw new Error("No matching USDC transfer was found in this Arc transaction");
}
