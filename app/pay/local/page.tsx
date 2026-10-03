"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Send, Wallet } from "lucide-react";
import { useAccount, useConnect, useReadContract } from "wagmi";
import { formatUnits, isAddress } from "viem";
import {
  ARC_EXPLORER,
  ARC_TESTNET_CHAIN_ID,
  USDC_ADDRESS,
  usdcAbi,
} from "../../../lib/arc";
import { extractTxHash, sendUsdcWithCircle } from "../../../lib/circle";
import { openMetaMaskMobileDapp } from "../../../lib/mobile-wallet";

function short(value: string) {
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function moneyAmount(value: string) {
  return "$" + Number(value || 0).toFixed(2);
}

export default function LocalPaymentPage() {
  const [ready, setReady] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("SplitFlow payment");
  const [group, setGroup] = useState("SplitFlow group");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFrom((params.get("from") || "").toLowerCase());
    setTo((params.get("to") || "").toLowerCase());
    setAmount(params.get("amount") || "");
    setLabel(params.get("label") || "SplitFlow payment");
    setGroup(params.get("group") || "SplitFlow group");
    setReady(true);
  }, []);

  const { address, isConnected, connector } = useAccount();
  const { connectors, connectAsync, isPending: connecting } = useConnect();
  const preferred =
    connectors.find((item) =>
      item.name.toLowerCase().includes("metamask"),
    ) ?? connectors[0];

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");

  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "balanceOf",
    chainId: ARC_TESTNET_CHAIN_ID,
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: address ? 10_000 : false,
    },
  });

  const valid =
    isAddress(from) &&
    isAddress(to) &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0;

  const intended =
    Boolean(address) && address!.toLowerCase() === from;

  const balanceValue =
    typeof balance.data === "bigint"
      ? Number(formatUnits(balance.data, 6))
      : 0;

  async function connectWallet() {
    setError("");

    if (preferred) {
      try {
        await connectAsync({ connector: preferred });
        return;
      } catch (cause) {
        if (!/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to connect wallet",
          );
          return;
        }
      }
    }

    openMetaMaskMobileDapp();
  }

  async function pay() {
    if (!connector || !valid || !intended) return;

    setPaying(true);
    setError("");

    try {
      const result = await sendUsdcWithCircle(connector, to, amount);
      const txHash = extractTxHash(result);

      if (!txHash) {
        throw new Error("No Arc transaction hash was returned");
      }

      setHash(txHash);
      await balance.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Payment failed",
      );
    } finally {
      setPaying(false);
    }
  }

  if (!ready) {
    return (
      <main className="paymentShell">
        <div className="paymentCard card">
          <Loader2 className="spin" size={24} />
          <p className="muted">Loading payment request…</p>
        </div>
      </main>
    );
  }

  if (!valid) {
    return (
      <main className="paymentShell">
        <div className="paymentCard card">
          <h1>Invalid payment request</h1>
          <p className="muted">
            This SplitFlow payment link is incomplete.
          </p>
          <Link className="secondary payButton" href="/">
            Back to SplitFlow
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="paymentShell">
      <div className="payBrand">
        <div className="logo">SF</div>
        <b>SplitFlow</b>
        <span>Arc Testnet</span>
      </div>

      <div className="paymentCard card">
        {hash ? (
          <>
            <div className="paidMark">
              <Check size={30} />
            </div>
            <div className="eyebrow">Payment complete</div>
            <h1>{Number(amount).toFixed(2)} USDC paid</h1>
            <p className="muted">
              {label} · {group}
            </p>

            <a
              className="secondary payButton"
              href={ARC_EXPLORER + "/tx/" + hash}
              target="_blank"
              rel="noreferrer"
            >
              View Arc transaction <ExternalLink size={14} />
            </a>

            <Link className="primary payButton" href="/">
              Back to SplitFlow
            </Link>
          </>
        ) : (
          <>
            <div className="eyebrow">USDC payment request</div>
            <h1>{label}</h1>
            <p className="muted">{group}</p>

            <div className="requestAmount">
              <span>You owe</span>
              <b>{moneyAmount(amount)}</b>
              <small>USDC · Arc Testnet</small>
            </div>

            <div className="requestDetails">
              <div>
                <span>From</span>
                <b>{short(from)}</b>
              </div>
              <div>
                <span>To</span>
                <b>{short(to)}</b>
              </div>
            </div>

            {!isConnected ? (
              <button
                className="primary payButton"
                disabled={connecting}
                onClick={connectWallet}
              >
                {connecting ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Wallet size={17} />
                )}
                {connecting
                  ? "Connecting…"
                  : "Connect wallet to pay"}
              </button>
            ) : !intended ? (
              <div className="errorBox">
                Connect wallet {short(from)} to pay this request.
                Connected: {short(address!)}
              </div>
            ) : (
              <>
                <div className="walletBalanceRow">
                  <span>Available on Arc</span>
                  <b>
                    {balance.isError
                      ? "Unavailable"
                      : balanceValue.toFixed(2) + " USDC"}
                  </b>
                </div>

                <button
                  className="primary payButton"
                  disabled={
                    paying ||
                    balance.isError ||
                    balanceValue < Number(amount)
                  }
                  onClick={pay}
                >
                  {paying ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Send size={17} />
                  )}
                  {paying
                    ? "Confirming on Arc…"
                    : "Pay " +
                      Number(amount).toFixed(2) +
                      " USDC"}
                </button>
              </>
            )}

            {error && <div className="errorBox">{error}</div>}
          </>
        )}
      </div>
    </main>
  );
}
