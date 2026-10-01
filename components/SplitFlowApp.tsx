"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  ReceiptText,
  Send,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import type { Connector } from "wagmi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  ARC_EXPLORER,
  ARC_TESTNET_CHAIN_ID,
  USDC_ADDRESS,
  usdcAbi,
} from "../lib/arc";
import { extractTxHash, sendUsdcWithCircle } from "../lib/circle";
import type {
  Expense,
  ExpenseSplit,
  GroupDetail,
  GroupMember,
  GroupSummary,
  SettlementTransfer,
} from "../lib/types";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};

  if (raw) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Request failed (" + response.status + ")",
    );
  }

  return data as T;
}

function shortAddress(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function displayName(
  member: GroupMember | undefined,
  wallet: string,
  currentWallet?: string,
) {
  if (currentWallet?.toLowerCase() === wallet.toLowerCase()) return "You";
  const savedName = member?.display_name?.trim();
  if (savedName && savedName.toLowerCase() !== "you") return savedName;
  return shortAddress(wallet);
}

export default function SplitFlowApp() {
  const queryClient = useQueryClient();
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const preferredConnector =
    connectors.find((item) => item.name.toLowerCase().includes("metamask")) ??
    connectors[0];
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [authError, setAuthError] = useState("");

  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ address: string | null }>("/api/auth/session"),
  });

  const signedIn =
    Boolean(address) &&
    session.data?.address?.toLowerCase() === address?.toLowerCase();

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

  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api<{ groups: GroupSummary[] }>("/api/groups"),
    enabled: signedIn,
    refetchInterval: signedIn ? 10_000 : false,
  });

  useEffect(() => {
    if (!selectedGroup && groups.data?.groups?.[0]) {
      setSelectedGroup(groups.data.groups[0].id);
    }
  }, [groups.data, selectedGroup]);

  async function signIn() {
    if (!address) return;
    setAuthError("");
    try {
      const challenge = await api<{ message: string }>(
        "/api/auth/challenge?address=" + address,
      );
      const signature = await signMessageAsync({ message: challenge.message });
      await api("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message: challenge.message, signature }),
      });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    queryClient.clear();
    setSelectedGroup(null);
    disconnect();
  }

  const balanceLabel =
    typeof balance.data === "bigint"
      ? Number(formatUnits(balance.data, 6)).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : "0.00";

  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand">
          <div className="logo">S</div>
          <div>
            SplitFlow
            <div className="brandSub">Group payments on Arc</div>
          </div>
        </div>

        <div className="navActions">
          {isConnected && (
            <div className="balanceChip">
              <span>{balanceLabel} USDC</span>
              <small>Arc Testnet</small>
            </div>
          )}
          {!isConnected ? (
            <button
              className="wallet"
              disabled={isConnecting || !preferredConnector}
              onClick={() => preferredConnector && connect({ connector: preferredConnector })}
            >
              <Wallet size={16} />
              {isConnecting ? "Connecting…" : "Connect wallet"}
            </button>
          ) : (
            <button className="wallet" onClick={logout}>
              {shortAddress(address)}
              <LogOut size={15} />
            </button>
          )}
        </div>
      </nav>

      {!isConnected ? (
        <section className="welcome card">
          <div className="heroMark"><Sparkles size={24} /></div>
          <div className="eyebrow">Arc-native group settlement</div>
          <h1>Split expenses. Net the debt. Settle in USDC.</h1>
          <p className="muted lead">
            Create a group, add wallet addresses, split expenses, share payment
            requests, and let Smart Settlement reduce unnecessary transactions.
          </p>
          <button
            className="primary"
            disabled={!preferredConnector}
            onClick={() => preferredConnector && connect({ connector: preferredConnector })}
          >
            <Wallet size={17} /> Connect wallet
          </button>
        </section>
      ) : !signedIn ? (
        <section className="welcome card">
          <div className="heroMark"><Wallet size={24} /></div>
          <div className="eyebrow">Wallet verification</div>
          <h1>Sign in to your SplitFlow workspace.</h1>
          <p className="muted lead">
            This signature is free. It proves you control {shortAddress(address)}
            and protects group editing without asking for private keys.
          </p>
          <button className="primary" onClick={signIn}>
            Sign message to continue
          </button>
          {authError && <div className="errorBox">{authError}</div>}
        </section>
      ) : (
        <>
          <section className="hero compactHero">
            <div className="card">
              <div className="eyebrow">Arc USDC balance</div>
              <div className="balance">
                {balanceLabel} <span className="muted smallUnit">USDC</span>
              </div>
              <div className="muted">
                Live balance from the Arc USDC contract.
              </div>
              <div className="actions">
                <button className="primary" onClick={() => setShowGroupForm(true)}>
                  <Plus size={16} /> Create group
                </button>
                <a
                  className="secondary"
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get test USDC <ExternalLink size={14} />
                </a>
              </div>
            </div>
            <div className="card networkCard">
              <div className="eyebrow">Settlement rail</div>
              <div className="metric">Arc Testnet</div>
              <div className="muted">Chain ID {ARC_TESTNET_CHAIN_ID}</div>
              <div className="pill">Circle App Kit • USDC</div>
            </div>
          </section>

          <section className="appGrid">
            <aside className="card groupsSidebar">
              <div className="sectionTitle">
                <h2>Your groups</h2>
                <button className="iconButton" onClick={() => setShowGroupForm(true)}>
                  <Plus size={16} />
                </button>
              </div>

              {groups.isLoading && <LoadingLine />}
              {groups.error && (
                <div className="errorBox">
                  {groups.error instanceof Error
                    ? groups.error.message
                    : "Unable to load groups"}
                </div>
              )}
              {!groups.isLoading && groups.data?.groups.length === 0 && (
                <div className="emptyState">
                  <Users size={24} />
                  <b>No groups yet</b>
                  <span>Create your first SplitFlow group.</span>
                </div>
              )}

              <div className="groupList">
                {groups.data?.groups.map((group) => (
                  <button
                    key={group.id}
                    className={
                      "groupButton " +
                      (selectedGroup === group.id ? "groupButtonActive" : "")
                    }
                    onClick={() => setSelectedGroup(group.id)}
                  >
                    <div>
                      <b>{group.name}</b>
                      <span>{group.member_count} members</span>
                    </div>
                    <div className="groupCount">
                      {group.pending_count > 0 ? group.pending_count : <Check size={15} />}
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="workspace">
              {selectedGroup ? (
                <GroupWorkspace
                  groupId={selectedGroup}
                  wallet={address!}
                  connector={connector}
                />
              ) : (
                <div className="card emptyWorkspace">
                  <Users size={30} />
                  <h2>Select or create a group</h2>
                  <p className="muted">
                    Your expenses, payment links and Smart Settlement plan will
                    appear here.
                  </p>
                </div>
              )}
            </section>
          </section>
        </>
      )}

      {showGroupForm && (
        <CreateGroupModal
          onClose={() => setShowGroupForm(false)}
          onCreated={(id) => {
            setShowGroupForm(false);
            setSelectedGroup(id);
            queryClient.invalidateQueries({ queryKey: ["groups"] });
          }}
        />
      )}

      <div className="footer">
        SplitFlow • Non-custodial USDC group settlement on Arc
      </div>
    </main>
  );
}

function LoadingLine() {
  return (
    <div className="loadingLine">
      <Loader2 className="spin" size={16} /> Loading…
    </div>
  );
}

function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [membersText, setMembersText] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const members = membersText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const pieces = line.split(",").map((x) => x.trim());
          if (pieces.length >= 2) {
            return { name: pieces[0], wallet: pieces[1] };
          }
          return { wallet: pieces[0] };
        });

      return api<{ group: { id: string } }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name, members }),
      });
    },
    onSuccess: (data) => onCreated(data.group.id),
    onError: (e) => setError(e instanceof Error ? e.message : "Unable to create group"),
  });

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div className="modal card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sectionTitle">
          <div>
            <div className="eyebrow">New group</div>
            <h2>Create SplitFlow group</h2>
          </div>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>

        <div className="form">
          <label>
            Group name
            <input
              className="input"
              placeholder="Trip to Goa"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Member wallets
            <textarea
              className="input textarea"
              placeholder={"Alex, 0x...\nSam, 0x...\nRyan, 0x..."}
              value={membersText}
              onChange={(e) => setMembersText(e.target.value)}
            />
          </label>
          <div className="hint">
            Your connected wallet is added automatically. Put one member per line.
          </div>
          {error && <div className="errorBox">{error}</div>}
          <button
            className="primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
            Create group
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupWorkspace({
  groupId,
  wallet,
  connector,
}: {
  groupId: string;
  wallet: string;
  connector?: Connector;
}) {
  const queryClient = useQueryClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [showExpense, setShowExpense] = useState(false);
  const [copied, setCopied] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const detail = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api<GroupDetail>("/api/groups/" + groupId),
    refetchInterval: 5_000,
  });

  const settlement = useMutation({
    mutationFn: () =>
      api("/api/groups/" + groupId + "/settlements", { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "Unable to optimize settlement"),
  });

  const cancelSettlement = useMutation({
    mutationFn: () =>
      api("/api/groups/" + groupId + "/settlements", { method: "DELETE" }),
    onSuccess: async () => {
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "Unable to cancel settlement plan"),
  });

  async function copyPaymentLink(token: string) {
    const url = window.location.origin + "/pay/" + token;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    window.setTimeout(() => setCopied(""), 1500);
  }

  async function payTransfer(transfer: SettlementTransfer) {
    if (!connector) {
      setActionError("Connect the wallet that owes this settlement.");
      return;
    }
    setPayingId(transfer.id);
    setActionError("");
    try {
      if (chainId !== ARC_TESTNET_CHAIN_ID) {
        await switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID });
      }
      const result = await sendUsdcWithCircle(
        connector,
        transfer.to_wallet,
        transfer.amount_usdc,
      );
      const txHash = extractTxHash(result);
      if (!txHash) {
        throw new Error("Circle send completed but no transaction hash was returned");
      }

      await api("/api/settlements/" + transfer.id + "/confirm", {
        method: "POST",
        body: JSON.stringify({ txHash }),
      });

      await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Settlement failed");
    } finally {
      setPayingId(null);
    }
  }

  if (detail.isLoading) return <div className="card"><LoadingLine /></div>;
  if (detail.error || !detail.data) {
    return (
      <div className="card errorBox">
        {detail.error instanceof Error ? detail.error.message : "Unable to load group"}
      </div>
    );
  }

  const data = detail.data;
  const memberByWallet = new Map(
    data.members.map((m) => [m.wallet_address.toLowerCase(), m]),
  );
  const expenseById = new Map(data.expenses.map((e) => [e.id, e]));

  const pendingSplits = data.splits.filter((s) => s.status === "pending");
  const youOwe = pendingSplits
    .filter((s) => s.wallet_address.toLowerCase() === wallet.toLowerCase())
    .reduce((sum, s) => sum + Number(s.amount_usdc), 0);
  const owedToYou = pendingSplits
    .filter((s) => {
      const expense = expenseById.get(s.expense_id);
      return expense?.paid_by.toLowerCase() === wallet.toLowerCase();
    })
    .reduce((sum, s) => sum + Number(s.amount_usdc), 0);

  const openRound = data.settlementRounds.find((r) => r.status === "open");
  const planTransfers = openRound
    ? data.settlementTransfers.filter((t) => t.round_id === openRound.id)
    : [];
  const planHasPayments = planTransfers.some((t) => t.status === "paid");

  return (
    <div className="workspaceStack">
      <div className="card">
        <div className="groupHeader">
          <div>
            <div className="eyebrow">Group</div>
            <h1>{data.group.name}</h1>
            <div className="memberAvatars">
              {data.members.map((m) => (
                <span key={m.id} title={m.wallet_address}>
                  {displayName(m, m.wallet_address, wallet).slice(0, 2).toUpperCase()}
                </span>
              ))}
              <small>{data.members.length} members</small>
            </div>
          </div>
          <button
            className="primary"
            disabled={Boolean(openRound)}
            title={openRound ? "Finish or cancel Smart Settlement first" : undefined}
            onClick={() => setShowExpense(true)}
          >
            <ReceiptText size={16} /> {openRound ? "Settlement active" : "Add expense"}
          </button>
        </div>

        <div className="metricGrid">
          <div className="metricBox">
            <span>You owe</span>
            <b className={youOwe > 0 ? "amber" : ""}>{"$" + youOwe.toFixed(2)}</b>
          </div>
          <div className="metricBox">
            <span>Owed to you</span>
            <b className={owedToYou > 0 ? "green" : ""}>{"$" + owedToYou.toFixed(2)}</b>
          </div>
          <div className="metricBox">
            <span>Open requests</span>
            <b>{pendingSplits.length}</b>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sectionTitle">
          <div>
            <h2><Sparkles size={17} /> Smart Settlement</h2>
            <p className="muted smallText">
              Net all pending debts before anyone pays.
            </p>
          </div>
          {!openRound && pendingSplits.length > 0 && (
            <button
              className="secondary"
              disabled={settlement.isPending}
              onClick={() => settlement.mutate()}
            >
              {settlement.isPending ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
              Optimize
            </button>
          )}
        </div>

        {pendingSplits.length === 0 ? (
          <div className="successBox"><Check size={17} /> Group is fully settled.</div>
        ) : openRound ? (
          <>
            <div className="optimizationBanner">
              <b>{pendingSplits.length} expense debts</b>
              <ArrowRight size={16} />
              <b>{planTransfers.length} optimized transfers</b>
              {!planHasPayments && (
                <button
                  className="iconTextButton"
                  disabled={cancelSettlement.isPending}
                  onClick={() => cancelSettlement.mutate()}
                >
                  {cancelSettlement.isPending ? "Cancelling…" : "Cancel plan"}
                </button>
              )}
            </div>
            <div className="settlementList">
              {planTransfers.map((transfer) => {
                const mine =
                  transfer.from_wallet.toLowerCase() === wallet.toLowerCase();
                return (
                  <div className="settlementItem" key={transfer.id}>
                    <div>
                      <b>
                        {displayName(
                          memberByWallet.get(transfer.from_wallet.toLowerCase()),
                          transfer.from_wallet,
                          wallet,
                        )}
                      </b>
                      <ArrowRight size={14} />
                      <b>
                        {displayName(
                          memberByWallet.get(transfer.to_wallet.toLowerCase()),
                          transfer.to_wallet,
                          wallet,
                        )}
                      </b>
                      <span>{"$" + Number(transfer.amount_usdc).toFixed(2) + " USDC"}</span>
                    </div>
                    {transfer.status === "paid" ? (
                      <span className="statusPaid"><Check size={14} /> Paid</span>
                    ) : mine ? (
                      <button
                        className="primary smallButton"
                        disabled={payingId === transfer.id}
                        onClick={() => payTransfer(transfer)}
                      >
                        {payingId === transfer.id ? (
                          <Loader2 className="spin" size={14} />
                        ) : (
                          <Send size={14} />
                        )}
                        Pay
                      </button>
                    ) : (
                      <span className="statusPending">Waiting</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="muted">
            {pendingSplits.length} pending expense payments can be optimized.
          </div>
        )}
        {actionError && <div className="errorBox">{actionError}</div>}
      </div>

      <div className="card">
        <div className="sectionTitle">
          <h2>Expenses</h2>
          <span className="muted">{data.expenses.length} total</span>
        </div>

        {data.expenses.length === 0 ? (
          <div className="emptyState compact">
            <ReceiptText size={22} />
            <b>No expenses yet</b>
          </div>
        ) : (
          <div className="expenseList">
            {data.expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                splits={data.splits.filter((s) => s.expense_id === expense.id)}
                members={data.members}
                currentWallet={wallet}
                copied={copied}
                copyPaymentLink={copyPaymentLink}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="sectionTitle">
          <h2>Verified Arc history</h2>
          <span className="pill">{data.transactions.length} transactions</span>
        </div>
        {data.transactions.length === 0 ? (
          <div className="muted">Confirmed settlements will appear here.</div>
        ) : (
          <div className="transactionList">
            {data.transactions.map((tx) => (
              <a
                key={tx.id}
                className="transactionRow"
                href={ARC_EXPLORER + "/tx/" + tx.tx_hash}
                target="_blank"
                rel="noreferrer"
              >
                <div className="txIcon"><Check size={15} /></div>
                <div className="activityMain">
                  <b>
                    {shortAddress(tx.from_wallet)} → {shortAddress(tx.to_wallet)}
                  </b>
                  <span>{shortAddress(tx.tx_hash)}</span>
                </div>
                <div className="txAmount">
                  {"$" + Number(tx.amount_usdc).toFixed(2)}
                  <ExternalLink size={13} />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {showExpense && (
        <CreateExpenseModal
          group={data}
          wallet={wallet}
          onClose={() => setShowExpense(false)}
          onCreated={async () => {
            setShowExpense(false);
            await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
            await queryClient.invalidateQueries({ queryKey: ["groups"] });
          }}
        />
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  splits,
  members,
  currentWallet,
  copied,
  copyPaymentLink,
}: {
  expense: Expense;
  splits: ExpenseSplit[];
  members: GroupMember[];
  currentWallet: string;
  copied: string;
  copyPaymentLink: (token: string) => void;
}) {
  const payer = members.find(
    (m) => m.wallet_address.toLowerCase() === expense.paid_by.toLowerCase(),
  );
  const paidCount = splits.filter((s) => s.status === "paid").length;

  return (
    <div className="expenseCard">
      <div className="expenseTop">
        <div>
          <b>{expense.description}</b>
          <span>
            Paid by {displayName(payer, expense.paid_by, currentWallet)} • {expense.split_type} split
          </span>
        </div>
        <div className="expenseAmount">
          {"$" + Number(expense.amount_usdc).toFixed(2)}
          <small>{paidCount}/{splits.length} paid</small>
        </div>
      </div>

      <div className="splitRows">
        {splits.map((split) => {
          const member = members.find(
            (m) => m.wallet_address.toLowerCase() === split.wallet_address.toLowerCase(),
          );
          const isPayer =
            split.wallet_address.toLowerCase() === expense.paid_by.toLowerCase();

          return (
            <div className="splitRow" key={split.id}>
              <div>
                <b>{displayName(member, split.wallet_address, currentWallet)}</b>
                <span>{"$" + Number(split.amount_usdc).toFixed(2)}</span>
              </div>
              <div className="splitActions">
                {split.status === "paid" ? (
                  <span className="statusPaid"><Check size={13} /> Paid</span>
                ) : split.locked_by_settlement ? (
                  <span className="statusPending">Smart plan</span>
                ) : (
                  <>
                    <span className="statusPending">Pending</span>
                    {!isPayer && (
                      <button
                        className="iconTextButton"
                        onClick={() => copyPaymentLink(split.payment_token)}
                      >
                        {copied === split.payment_token ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                        {copied === split.payment_token ? "Copied" : "Payment link"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateExpenseModal({
  group,
  wallet,
  onClose,
  onCreated,
}: {
  group: GroupDetail;
  wallet: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(wallet.toLowerCase());
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const customSplits =
        splitType === "custom"
          ? group.members.map((m) => ({
              wallet: m.wallet_address,
              amount: custom[m.wallet_address] || "0",
            }))
          : undefined;

      return api("/api/groups/" + group.group.id + "/expenses", {
        method: "POST",
        body: JSON.stringify({
          description,
          amount,
          paidBy,
          splitType,
          customSplits,
        }),
      });
    },
    onSuccess: onCreated,
    onError: (e) => setError(e instanceof Error ? e.message : "Unable to create expense"),
  });

  const equalPreview =
    splitType === "equal" && Number(amount) > 0
      ? Number(amount) / Math.max(group.members.length, 1)
      : 0;

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div className="modal card wideModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sectionTitle">
          <div>
            <div className="eyebrow">New expense</div>
            <h2>{group.group.name}</h2>
          </div>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>

        <div className="form">
          <label>
            What was paid for?
            <input
              className="input"
              placeholder="Beach house"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="two">
            <label>
              Total USDC
              <input
                className="input"
                inputMode="decimal"
                placeholder="120.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Paid by
              <select
                className="input"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
              >
                {group.members.map((m) => (
                  <option value={m.wallet_address} key={m.id}>
                    {displayName(m, m.wallet_address, wallet)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="segmented">
            <button
              className={splitType === "equal" ? "segActive" : ""}
              onClick={() => setSplitType("equal")}
              type="button"
            >
              Equal split
            </button>
            <button
              className={splitType === "custom" ? "segActive" : ""}
              onClick={() => setSplitType("custom")}
              type="button"
            >
              Custom split
            </button>
          </div>

          {splitType === "equal" ? (
            <div className="splitPreview">
              {group.members.map((m) => (
                <div key={m.id}>
                  <span>{displayName(m, m.wallet_address, wallet)}</span>
                  <b>{"$" + equalPreview.toFixed(2)}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="splitPreview">
              {group.members.map((m) => (
                <label key={m.id}>
                  <span>{displayName(m, m.wallet_address, wallet)}</span>
                  <input
                    className="miniInput"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={custom[m.wallet_address] || ""}
                    onChange={(e) =>
                      setCustom((prev) => ({
                        ...prev,
                        [m.wallet_address]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          )}

          {error && <div className="errorBox">{error}</div>}

          <button
            className="primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="spin" size={16} /> : <ReceiptText size={16} />}
            Create expense & payment requests
          </button>
        </div>
      </div>
    </div>
  );
}
