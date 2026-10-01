"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Rocket, Wallet } from "lucide-react";
import {
  createPublicClient,
  encodeDeployData,
  formatUnits,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import artifact from "../../lib/generated/SplitFlowSettlement.json";
import {
  ARC_EXPLORER,
  ARC_TESTNET_CHAIN_HEX,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  USDC_ADDRESS,
  arcTestnet,
} from "../../lib/arc";
import {
  ensureArcTestnet,
  getInjectedProvider,
  walletErrorMessage,
  type BrowserProvider,
} from "../../lib/wallet-network";
import { openMetaMaskMobileDapp } from "../../lib/mobile-wallet";

function short(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function normalizeAddress(value: unknown): Address | null {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? (value as Address)
    : null;
}

function normalizeHash(value: unknown): Hex | null {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value)
    ? (value as Hex)
    : null;
}

export default function DeployContractPage() {
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: arcTestnet,
        transport: http(ARC_TESTNET_RPC),
      }),
    [],
  );

  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainHex, setChainHex] = useState<string>("");
  const [balance, setBalance] = useState<bigint>(0n);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "switching" | "signing" | "confirming" | "success"
  >("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [contractAddress, setContractAddress] = useState<Address | null>(null);
  const [error, setError] = useState("");

  async function refreshWallet(targetProvider: BrowserProvider, preferred?: Address | null) {
    const accounts = (await targetProvider.request({
      method: "eth_accounts",
    })) as unknown[];
    const selected = preferred ?? normalizeAddress(accounts?.[0]);
    const chain = await targetProvider.request({ method: "eth_chainId" });

    setAccount(selected);
    setChainHex(typeof chain === "string" ? chain.toLowerCase() : "");

    if (selected) {
      try {
        const value = await publicClient.getBalance({ address: selected });
        setBalance(value);
      } catch {
        setBalance(0n);
      }
    } else {
      setBalance(0n);
    }
  }

  useEffect(() => {
    const injected = getInjectedProvider();
    setProvider(injected);
    if (!injected) return;

    void refreshWallet(injected);

    const accountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as unknown[]) : [];
      const next = normalizeAddress(accounts[0]);
      void refreshWallet(injected, next);
    };
    const chainChanged = (...args: unknown[]) => {
      const chain = args[0];
      setChainHex(typeof chain === "string" ? chain.toLowerCase() : "");
      void refreshWallet(injected);
    };

    injected.on?.("accountsChanged", accountsChanged);
    injected.on?.("chainChanged", chainChanged);

    return () => {
      injected.removeListener?.("accountsChanged", accountsChanged);
      injected.removeListener?.("chainChanged", chainChanged);
    };
  }, [publicClient]);

  async function connectWallet() {
    const injected = provider ?? getInjectedProvider();
    setError("");

    if (!injected) {
      openMetaMaskMobileDapp();
      return;
    }

    setProvider(injected);
    setStatus("connecting");

    try {
      const accounts = (await injected.request({
        method: "eth_requestAccounts",
      })) as unknown[];
      const selected = normalizeAddress(accounts?.[0]);
      if (!selected) throw new Error("The wallet did not return an account");
      await refreshWallet(injected, selected);
    } catch (cause) {
      setError(walletErrorMessage(cause, "Unable to connect wallet"));
    } finally {
      setStatus("idle");
    }
  }

  async function deploy() {
    const injected = provider ?? getInjectedProvider();
    setError("");
    setTxHash(null);
    setContractAddress(null);

    if (!injected) {
      openMetaMaskMobileDapp();
      return;
    }

    try {
      setStatus("connecting");
      const accounts = (await injected.request({
        method: "eth_requestAccounts",
      })) as unknown[];
      const selected = normalizeAddress(accounts?.[0]);
      if (!selected) throw new Error("The wallet did not return an account");
      setAccount(selected);

      setStatus("switching");
      await ensureArcTestnet(injected);

      const selectedChain = await injected.request({ method: "eth_chainId" });
      if (
        typeof selectedChain !== "string" ||
        selectedChain.toLowerCase() !== ARC_TESTNET_CHAIN_HEX
      ) {
        throw new Error("Wallet network verification failed before deployment");
      }

      const gasBalance = await publicClient.getBalance({ address: selected });
      setBalance(gasBalance);
      if (gasBalance === 0n) {
        throw new Error("This wallet has no Arc Testnet gas balance.");
      }

      const data = encodeDeployData({
        abi: artifact.abi as Abi,
        bytecode: artifact.bytecode as Hex,
        args: [USDC_ADDRESS],
      });

      setStatus("signing");

      const rawHash = await injected.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: selected,
            data,
          },
        ],
      });

      const hash = normalizeHash(rawHash);
      if (!hash) throw new Error("The wallet did not return a deployment transaction hash");

      setTxHash(hash);
      setStatus("confirming");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120_000,
      });

      if (receipt.status !== "success" || !receipt.contractAddress) {
        throw new Error("Arc returned a failed contract deployment receipt");
      }

      const code = await publicClient.getBytecode({
        address: receipt.contractAddress,
      });
      if (!code || code === "0x") {
        throw new Error("No contract bytecode was found at the deployed address");
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
      setError(walletErrorMessage(cause, "Contract deployment failed"));
      await refreshWallet(injected, account);
    }
  }

  const onArc = chainHex === ARC_TESTNET_CHAIN_HEX;
  const balanceLabel = Number(formatUnits(balance, 18)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });

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
            <div className="heroMark"><Rocket size={24} /></div>
            <div className="eyebrow">Deploy on Arc Testnet</div>
            <h1>Deploy SplitFlowSettlement</h1>
            <p className="muted lead">
              This deployment uses the injected wallet directly. Before the
              transaction is sent, SplitFlow verifies that the wallet itself is
              on Arc Testnet.
            </p>

            <div className="requestDetails">
              <div>
                <span>Network</span>
                <b>Arc Testnet · {ARC_TESTNET_CHAIN_ID}</b>
              </div>
              <div>
                <span>Wallet network</span>
                <b>{account ? (onArc ? "Arc Testnet ✓" : chainHex || "Unknown") : "Not connected"}</b>
              </div>
            </div>

            {account && (
              <div className="walletBalanceRow">
                <span>Wallet / Arc gas balance</span>
                <b>{short(account)} · {balanceLabel} USDC</b>
              </div>
            )}

            {!provider || !account ? (
              <button
                className="primary payButton"
                disabled={status !== "idle"}
                onClick={connectWallet}
              >
                {status === "connecting" ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Wallet size={17} />
                )}
                {status === "connecting"
                  ? "Connecting…"
                  : provider
                    ? "Connect MetaMask"
                    : "Open in MetaMask"}
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
                {status === "connecting"
                  ? "Checking wallet…"
                  : status === "switching"
                    ? "Switching to Arc Testnet…"
                    : status === "signing"
                      ? "Approve deployment in wallet…"
                      : status === "confirming"
                        ? "Confirming on Arc…"
                        : "Switch to Arc & deploy"}
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
              No private key is ever sent to SplitFlow. The browser wallet signs
              and broadcasts the deployment transaction.
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
