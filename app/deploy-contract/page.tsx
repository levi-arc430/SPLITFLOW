"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Rocket, Wallet } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import type { Abi, Address, EIP1193Provider, Hex } from "viem";
import { useAccount, useBalance, useConnect } from "wagmi";
import artifact from "../../lib/generated/SplitFlowSettlement.json";
import {
  ARC_EXPLORER,
  ARC_TESTNET_CHAIN_HEX,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  USDC_ADDRESS,
  arcTestnet,
} from "../../lib/arc";

function short(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function errorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return Number((error as { code?: unknown }).code);
  }
  return undefined;
}

async function ensureArcTestnet(provider: EIP1193Provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET_CHAIN_HEX }],
    });
  } catch (error) {
    if (errorCode(error) !== 4902) throw error;

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
          rpcUrls: ["https://rpc.testnet.arc.network"],
          blockExplorerUrls: [ARC_EXPLORER],
        },
      ],
    });

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET_CHAIN_HEX }],
    });
  }

  const selectedChain = await provider.request({ method: "eth_chainId" });

  if (
    typeof selectedChain !== "string" ||
    selectedChain.toLowerCase() !== ARC_TESTNET_CHAIN_HEX
  ) {
    throw new Error(
      "MetaMask did not switch to Arc Testnet. Open MetaMask, select Arc Testnet, then try again.",
    );
  }
}

export default function DeployContractPage() {
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();

  const nativeBalance = useBalance({
    address,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const preferredConnector =
    connectors.find((item) => item.name.toLowerCase().includes("metamask")) ??
    connectors[0];

  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [contractAddress, setContractAddress] = useState<Address | null>(null);
  const [status, setStatus] = useState<
    "idle" | "switching" | "signing" | "confirming" | "success"
  >("idle");
  const [error, setError] = useState("");

  async function deploy() {
    setError("");
    setTxHash(null);
    setContractAddress(null);

    try {
      if (!address) {
        throw new Error("Connect the deployment wallet first");
      }

      if (!connector) {
        throw new Error(
          "Connected wallet provider is unavailable. Reconnect MetaMask and try again.",
        );
      }

      const rawProvider = await connector.getProvider();
      if (!rawProvider) {
        throw new Error("Unable to access the connected wallet provider");
      }

      const provider = rawProvider as EIP1193Provider;

      setStatus("switching");
      await ensureArcTestnet(provider);

      if ((nativeBalance.data?.value ?? 0n) === 0n) {
        throw new Error(
          "This wallet has no Arc Testnet gas balance. Fund it from the Arc/Circle testnet faucet first.",
        );
      }

      const walletClient = createWalletClient({
        account: address,
        chain: arcTestnet,
        transport: custom(provider),
      });

      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http(ARC_TESTNET_RPC),
      });

      setStatus("signing");

      const hash = await walletClient.deployContract({
        account: address,
        abi: artifact.abi as Abi,
        bytecode: artifact.bytecode as Hex,
        args: [USDC_ADDRESS],
      });

      setTxHash(hash);
      setStatus("confirming");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status !== "success" || !receipt.contractAddress) {
        throw new Error("Arc returned a failed contract deployment receipt");
      }

      const code = await publicClient.getBytecode({
        address: receipt.contractAddress,
      });

      if (!code || code === "0x") {
        throw new Error(
          "Deployment receipt succeeded but no contract bytecode was found",
        );
      }

      setContractAddress(receipt.contractAddress);
      setStatus("success");

      window.localStorage.setItem(
        "splitflow_arc_testnet_contract",
        JSON.stringify({
          address: receipt.contractAddress,
          txHash: hash,
          chainId: ARC_TESTNET_CHAIN_ID,
          deployedAt: new Date().toISOString(),
        }),
      );
    } catch (cause) {
      setStatus("idle");

      if (errorCode(cause) === 4001) {
        setError("The MetaMask request was cancelled. Click Deploy when you are ready.");
        return;
      }

      setError(
        cause instanceof Error ? cause.message : "Contract deployment failed",
      );
    }
  }

  return (
    <main className="paymentShell">
      <div className="payBrand">
        <div className="logo">S</div>
        <b>SplitFlow</b>
        <span>Contract deployment</span>
      </div>

      <div className="paymentCard card" style={{ textAlign: "left" }}>
        {status === "success" && contractAddress ? (
          <>
            <div className="paidMark" style={{ marginLeft: 0 }}>
              <Check size={30} />
            </div>
            <div className="eyebrow">Arc Testnet deployment successful</div>
            <h1>SplitFlowSettlement is live.</h1>
            <p className="muted">Contract address</p>
            <div className="input" style={{ overflowWrap: "anywhere" }}>
              {contractAddress}
            </div>
            <div className="actions">
              <a
                className="primary"
                href={ARC_EXPLORER + "/address/" + contractAddress}
                target="_blank"
                rel="noreferrer"
              >
                View contract <ExternalLink size={14} />
              </a>
              {txHash && (
                <a
                  className="secondary"
                  href={ARC_EXPLORER + "/tx/" + txHash}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction <ExternalLink size={14} />
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="heroMark">
              <Rocket size={24} />
            </div>
            <div className="eyebrow">Deploy on Arc Testnet</div>
            <h1>Deploy SplitFlowSettlement</h1>
            <p className="muted lead">
              This deploys the repository contract with Arc Testnet USDC
              configured as the settlement token. MetaMask will first switch to
              Arc Testnet, then ask you to approve the contract deployment.
            </p>

            <div className="requestDetails">
              <div>
                <span>Network</span>
                <b>Arc Testnet · {ARC_TESTNET_CHAIN_ID}</b>
              </div>
              <div>
                <span>USDC</span>
                <b>{short(USDC_ADDRESS)}</b>
              </div>
            </div>

            {isConnected && (
              <div className="walletBalanceRow">
                <span>Connected wallet / Arc gas balance</span>
                <b>
                  {short(address)} · {nativeBalance.data?.formatted ?? "0"} USDC
                </b>
              </div>
            )}

            {!isConnected ? (
              <button
                className="primary payButton"
                disabled={connecting || !preferredConnector}
                onClick={() =>
                  preferredConnector && connect({ connector: preferredConnector })
                }
              >
                <Wallet size={17} />
                {connecting ? "Connecting…" : "Connect MetaMask"}
              </button>
            ) : (
              <button
                className="primary payButton"
                disabled={status !== "idle"}
                onClick={deploy}
              >
                {status !== "idle" ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Rocket size={17} />
                )}
                {status === "switching"
                  ? "Switching MetaMask to Arc…"
                  : status === "signing"
                    ? "Approve deployment in MetaMask…"
                    : status === "confirming"
                      ? "Confirming on Arc…"
                      : "Deploy contract on Arc"}
              </button>
            )}

            {txHash && status !== "success" && (
              <a
                className="secondary"
                style={{ marginTop: 10 }}
                href={ARC_EXPLORER + "/tx/" + txHash}
                target="_blank"
                rel="noreferrer"
              >
                Track transaction <ExternalLink size={14} />
              </a>
            )}

            {error && <div className="errorBox">{error}</div>}

            <p className="hint" style={{ marginTop: 16 }}>
              The deploy flow verifies MetaMask is actually on chain 5042002
              before sending the contract creation transaction.
            </p>
          </>
        )}
      </div>

      <div className="paymentFoot">
        <Link href="/">← Back to SplitFlow</Link>
      </div>
    </main>
  );
}
