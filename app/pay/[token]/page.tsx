"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  ExternalLink,
  Loader2,
  Lock,
  Send,
  Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useChainId,
  useConnect,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { formatUnits } from "viem";
import {
  ARC_EXPLORER,
  ARC_TESTNET_CHAIN_ID,
  USDC_ADDRESS,
  usdcAbi,
} from "../../../lib/arc";
import { extractTxHash, sendUsdcWithCircle } from "../../../lib/circle";
import type { PaymentRequest } from "../../../lib/types";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

function short(value: string) {
  return value.slice(0, 6) + "…" + value.slice(-4);
}

export default function PaymentPage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token);
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [lastHash, setLastHash] = useState<string | null>(null);

  const paymentQuery = useQuery({
    queryKey: ["payment", token],
    queryFn: () =>
      api<{ payment: PaymentRequest }>("/api/payments/" + token),
  });

  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const payment = paymentQuery.data?.payment;
  const balanceValue =
    typeof balance.data === "bigint" ? Number(formatUnits(balance.data, 6)) : 0;
  const intendedWallet =
    Boolean(address && payment) &&
    address!.toLowerCase() === payment!.debtor.toLowerCase();

  async function pay() {
    if (!payment || !connector) return;
    setError("");
    setPaying(true);
    try {
      if (!intendedWallet) {
        throw new Error("Connect the wallet this payment request was created for");
      }
      if (payment.locked_by_settlement) {
        throw new Error("This payment is now part of the group's Smart Settlement plan");
      }
      if (balanceValue < Number(payment.amount_usdc)) {
        throw new Error("Not enough USDC on Arc Testnet");
      }
      if (chainId !== ARC_TESTNET_CHAIN_ID) {
        await switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID });
      }

      const result = await sendUsdcWithCircle(
        connector,
        payment.recipient,
        payment.amount_usdc,
      );
      const txHash = extractTxHash(result);
      if (!txHash) {
        throw new Error("Circle send completed but no Arc transaction hash was returned");
      }

      await api("/api/payments/" + token + "/confirm", {
        method: "POST",
        body: JSON.stringify({ txHash }),
      });

      setLastHash(txHash);
      await paymentQuery.refetch();
      await balance.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  if (paymentQuery.isLoading) {
    return (
      <main className="paymentShell">
        <div className="paymentCard card">
          <Loader2 className="spin" size={24} /> Loading payment request…
        </div>
      </main>
    );
  }

  if (paymentQuery.error || !payment) {
    return (
      <main className="paymentShell">
        <div className="paymentCard card">
          <h1>Payment request unavailable</h1>
          <p className="muted">
            {paymentQuery.error instanceof Error
              ? paymentQuery.error.message
              : "This payment link does not exist."}
          </p>
        </div>
      </main>
    );
  }

  const confirmedHash = payment.settled_tx_hash || lastHash;

  return (
    <main className="paymentShell">
      <div className="payBrand">
        <div className="logo">S</div>
        <b>SplitFlow</b>
        <span>on Arc</span>
      </div>

      <div className="paymentCard card">
        {payment.status === "paid" ? (
          <>
            <div className="paidMark"><Check size={30} /></div>
            <div className="eyebrow">Settlement complete</div>
            <h1>{"$" + Number(payment.amount_usdc).toFixed(2) + " USDC paid"}</h1>
            <p className="muted">
              {payment.description} • {payment.group_name}
            </p>
            {confirmedHash && (
              <a
                className="secondary"
                href={ARC_EXPLORER + "/tx/" + confirmedHash}
                target="_blank"
                rel="noreferrer"
              >
                View verified Arc transaction <ExternalLink size={14} />
              </a>
            )}
          </>
        ) : payment.locked_by_settlement ? (
          <>
            <div className="lockMark"><Lock size={25} /></div>
            <div className="eyebrow">Smart Settlement active</div>
            <h1>This individual request is locked.</h1>
            <p className="muted lead">
              The group has already netted this debt into an optimized settlement
              plan. Open SplitFlow from the intended wallet to complete the
              optimized transfer instead.
            </p>
          </>
        ) : (
          <>
            <div className="eyebrow">USDC payment request</div>
            <h1>{payment.description}</h1>
            <p className="muted">{payment.group_name}</p>

            <div className="requestAmount">
              <span>You owe</span>
              <b>{"$" + Number(payment.amount_usdc).toFixed(2)}</b>
              <small>USDC • Arc Testnet</small>
            </div>

            <div className="requestDetails">
              <div>
                <span>From</span>
                <b>{short(payment.debtor)}</b>
              </div>
              <div>
                <span>To</span>
                <b>{short(payment.recipient)}</b>
              </div>
            </div>

            {!isConnected ? (
              <button
                className="primary payButton"
                disabled={connecting || !connectors[0]}
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              >
                <Wallet size={17} />
                {connecting ? "Connecting…" : "Connect wallet to pay"}
              </button>
            ) : !intendedWallet ? (
              <div className="errorBox">
                This request belongs to {short(payment.debtor)}. Connected wallet:
                {" " + short(address!)}
              </div>
            ) : (
              <>
                <div className="walletBalanceRow">
                  <span>Available on Arc</span>
                  <b>{balanceValue.toFixed(2)} USDC</b>
                </div>
                <button
                  className="primary payButton"
                  disabled={paying || balanceValue < Number(payment.amount_usdc)}
                  onClick={pay}
                >
                  {paying ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
                  {paying
                    ? "Confirming on Arc…"
                    : "Pay " + Number(payment.amount_usdc).toFixed(2) + " USDC"}
                </button>
              </>
            )}

            {error && <div className="errorBox">{error}</div>}
          </>
        )}
      </div>

      <div className="paymentFoot">
        Circle App Kit • USDC • Arc Testnet
      </div>
    </main>
  );
}
