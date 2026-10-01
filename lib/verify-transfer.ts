import {
  createPublicClient,
  decodeFunctionData,
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
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);

  if (receipt.status !== "success") throw new Error("Transaction failed");
  if (tx.from.toLowerCase() !== input.from.toLowerCase()) {
    throw new Error("Transaction sender does not match payment request");
  }

  const expectedRecipient = input.to.toLowerCase();
  const expectedErc20Amount = parseUnits(input.amount, 6);

  if (tx.to?.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
    const decoded = decodeFunctionData({ abi: usdcAbi, data: tx.input });
    if (decoded.functionName !== "transfer") {
      throw new Error("Transaction is not a USDC transfer");
    }
    const [recipient, amount] = decoded.args;
    if (String(recipient).toLowerCase() !== expectedRecipient) {
      throw new Error("USDC recipient does not match");
    }
    if (amount !== expectedErc20Amount) {
      throw new Error("USDC amount does not match");
    }
    return { hash, blockNumber: receipt.blockNumber };
  }

  if (tx.to?.toLowerCase() === expectedRecipient) {
    const expectedNativeAmount = parseUnits(input.amount, 18);
    if (tx.value !== expectedNativeAmount) {
      throw new Error("Native USDC amount does not match");
    }
    return { hash, blockNumber: receipt.blockNumber };
  }

  throw new Error("Transaction target does not match the payment request");
}
