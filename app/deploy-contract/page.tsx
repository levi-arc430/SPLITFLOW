"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Rocket, Wallet } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import type { Abi, Address, EIP1193Provider, Hex } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useSwitchChain,
} from "wagmi";
import artifact from "../../lib/generated/SplitFlowSettlement.json";
import {
  ARC_EXPLORER,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  USDC_ADDRESS,
  arcTestnet,
} from "../../lib/arc";

function short(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 6) + "…" + value.slice(-4);
}

export default function DeployContractPage() {
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
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
  const [status, setStatus] = useState<"idle" | "signing" | "confirming" | "success">("idle");
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
        throw new Error("Connected wallet provider is unavailable. Reconnect the wallet and try again.");
      }
      if (chainId !== ARC_TESTNET_CHAIN_ID) {
        await switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID });
      }

      if ((nativeBalance.data?.value ?? 0n) === 0n) {
        throw new Error(
          "This wallet has no Arc Testnet gas balance. Fund it from the Arc/Circle testnet faucet first.",
        );
      }

      const provider = await connector.getProvider();
      if (!provider) {
        throw new Error("Unable to access the connected wallet provider");
      }

      const walletClient = createWalletClient({
        account: address,
        chain: arcTestnet,
        transport: custom(provider as EIP1193Provider),
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
        throw new Error("Deployment receipt succeeded but no contract bytecode was found");
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
      setError(cause instanceof Error ? cause.message : "Contract deployment failed");
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
              configured as the settlement token. Your wallet signs the
              transaction; SplitFlow never receives your private key.
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
                <span>Connected wallet / gas balance</span>
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
                {connecting ? "Connecting…" : "Connect wallet"}
              </button>
            ) : (
              <button
                className="primary payButton"
                disabled={status === "signing" || status === "confirming"}
                onClick={deploy}
              >
                {status === "signing" || status === "confirming" ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Rocket size={17} />
                )}
                {status === "signing"
                  ? "Approve deployment in wallet…"
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
              Arc documentation requires the deploying wallet to have Arc
              Testnet gas funds. If the balance above is zero, fund the wallet
              before deploying.
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
