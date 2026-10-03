"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Send,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useSignMessage,
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
import { openMetaMaskMobileDapp } from "../lib/mobile-wallet";
import LocalSplitFlow from "./LocalSplitFlow";
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

function money(value: number | string) {
  return "$" + Number(value || 0).toFixed(2);
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
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const preferredConnector =
    connectors.find((item) => item.name.toLowerCase().includes("metamask")) ??
    connectors[0];
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [authError, setAuthError] = useState("");
  const [cloudUnavailable, setCloudUnavailable] = useState(false);

  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ address: string | null }>("/api/auth/session"),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60_000,
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
    enabled: signedIn && !cloudUnavailable,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (groups.isError) {
      setCloudUnavailable(true);
    }
  }, [groups.isError]);

  useEffect(() => {
    if (!signedIn) {
      setCloudUnavailable(false);
    }
  }, [signedIn]);

  useEffect(() => {
    if (!selectedGroup && groups.data?.groups?.[0]) {
      setSelectedGroup(groups.data.groups[0].id);
    }
  }, [groups.data, selectedGroup]);

  async function connectWallet() {
    setAuthError("");
    if (preferredConnector) {
      try {
        await connectAsync({ connector: preferredConnector });
        return;
      } catch (error) {
        if (!/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
          setAuthError(error instanceof Error ? error.message : "Unable to connect wallet");
          return;
        }
      }
    }
    openMetaMaskMobileDapp();
  }

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
          <div className="logo">SF</div>
          <div>
            <div>SplitFlow</div>
            <div className="brandSub">Group payments on Arc</div>
          </div>
        </div>

        <div className="navActions">
          {isConnected && (
            <div className="balanceChip">
              <span>{balanceLabel} USDC</span>
              <small><i className="networkDot" /> Arc Testnet</small>
            </div>
          )}

          {!isConnected ? (
            <button
              className="wallet"
              disabled={isConnecting}
              onClick={connectWallet}
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
        <section className="landing">
          <div className="landingCopy">
            <div className="kicker">USDC expense settlement on Arc</div>
            <h1>Split the expense.<br />Settle the balance.</h1>
            <p>
              Create a group, record what was paid, and settle what everyone owes
              with fewer onchain transfers.
            </p>
            <div className="landingActions">
              <button
                className="primary"
                disabled={isConnecting}
                onClick={connectWallet}
              >
                <Wallet size={17} />
                {isConnecting ? "Connecting…" : "Connect wallet"}
              </button>
              <span>Non-custodial · Arc Testnet · USDC</span>
            </div>
            {authError && <div className="errorBox">{authError}</div>}
          </div>

          <div className="productPreview">
            <div className="previewTop">
              <span>Trip to Goa</span>
              <span className="statusPending">2 pending</span>
            </div>
            <div className="previewAmount">$120.00 <small>USDC</small></div>
            <div className="previewRows">
              <div><span>You</span><b>$30.00</b><em>Paid</em></div>
              <div><span>Alex</span><b>$30.00</b><em className="pendingText">Pending</em></div>
              <div><span>Sam</span><b>$30.00</b><em>Paid</em></div>
              <div><span>Ryan</span><b>$30.00</b><em className="pendingText">Pending</em></div>
            </div>
          </div>
        </section>
      ) : !signedIn ? (
        <section className="authPanel">
          <div className="authIcon"><Wallet size={22} /></div>
          <h1>Verify your wallet</h1>
          <p>
            Sign a free message to open your workspace. This does not send a
            transaction or spend USDC.
          </p>
          <button className="primary" onClick={signIn}>
            Sign message
          </button>
          {authError && <div className="errorBox">{authError}</div>}
        </section>
      ) : cloudUnavailable || groups.isError ? (
        <LocalSplitFlow wallet={address!} balanceLabel={balanceLabel} />
      ) : (
        <section className="appLayout">
          <aside className="sidePanel">
            <div className="sideHeader">
              <div>
                <span className="sideLabel">Groups</span>
                <b>{groups.data?.groups.length || 0}</b>
              </div>
              {(groups.data?.groups.length || 0) > 0 && (
                <button
                  className="iconButton"
                  title="Create group"
                  onClick={() => setShowGroupForm(true)}
                >
                  <Plus size={17} />
                </button>
              )}
            </div>

            {groups.isLoading && <LoadingLine />}

            {!groups.isLoading && groups.data?.groups.length === 0 && (
              <button
                className="emptyGroupButton"
                onClick={() => setShowGroupForm(true)}
              >
                <Plus size={18} />
                <b>Create your first group</b>
                <span>Add at least one other wallet to begin.</span>
              </button>
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
                  <div className="groupInitial">
                    {group.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="groupButtonBody">
                    <b>{group.name}</b>
                    <span>{group.member_count} members</span>
                  </div>
                  <div className={group.pending_count > 0 ? "pendingBadge" : "doneBadge"}>
                    {group.pending_count > 0 ? group.pending_count : <Check size={13} />}
                  </div>
                </button>
              ))}
            </div>

            <div className="sideFooter">
              <span><i className="networkDot" /> Arc Testnet</span>
              <span>{balanceLabel} USDC</span>
            </div>
          </aside>

          <section className="workspace">
            {selectedGroup ? (
              <GroupWorkspace
                groupId={selectedGroup}
                wallet={address!}
                connector={connector}
                onDeleted={() => {
                  setSelectedGroup(null);
                  queryClient.invalidateQueries({ queryKey: ["groups"] });
                }}
              />
            ) : (
              <Onboarding onCreate={() => setShowGroupForm(true)} />
            )}
          </section>
        </section>
      )}

      {showGroupForm && !groups.error && (
        <CreateGroupModal
          onClose={() => setShowGroupForm(false)}
          onCreated={(id) => {
            setShowGroupForm(false);
            setSelectedGroup(id);
            queryClient.invalidateQueries({ queryKey: ["groups"] });
          }}
        />
      )}
    </main>
  );
}

function Onboarding({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="onboardingCard">
      <div className="onboardingTitle">
        <span className="stepIndex">01</span>
        <div>
          <h2>Create a group</h2>
          <p>Add the wallets that will share expenses.</p>
        </div>
      </div>
      <div className="onboardingSteps">
        <div><span className="stepIndex">02</span><div><b>Add an expense</b><p>Choose who paid and how to split it.</p></div></div>
        <div><span className="stepIndex">03</span><div><b>Share payment links</b><p>Members settle their USDC amount on Arc.</p></div></div>
        <div><span className="stepIndex">04</span><div><b>Net the group</b><p>Reduce pending debts to fewer transfers.</p></div></div>
      </div>
      <button className="primary" onClick={onCreate}>
        <Plus size={16} /> Create first group
      </button>
    </div>
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
  const [members, setMembers] = useState([{ name: "", wallet: "" }]);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api<{ group: { id: string } }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          name,
          members: members.filter((member) => member.wallet.trim()),
        }),
      }),
    onSuccess: (data) => onCreated(data.group.id),
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Unable to create group"),
  });

  function updateMember(index: number, key: "name" | "wallet", value: string) {
    setMembers((current) =>
      current.map((member, i) =>
        i === index ? { ...member, [key]: value } : member,
      ),
    );
  }

  return (
    <Modal title="Create group" subtitle="Your connected wallet is added automatically." onClose={onClose}>
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

        <div className="formSectionLabel">
          <span>Members</span>
          <span>{members.length + 1} total including you</span>
        </div>

        <div className="memberFormRows">
          {members.map((member, index) => (
            <div className="memberFormRow" key={index}>
              <input
                className="input"
                placeholder="Name"
                value={member.name}
                onChange={(e) => updateMember(index, "name", e.target.value)}
              />
              <input
                className="input walletInput"
                placeholder="0x wallet address"
                value={member.wallet}
                onChange={(e) => updateMember(index, "wallet", e.target.value)}
              />
              {members.length > 1 && (
                <button
                  className="iconButton"
                  onClick={() =>
                    setMembers((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          className="textButton"
          type="button"
          onClick={() =>
            setMembers((current) => [...current, { name: "", wallet: "" }])
          }
        >
          <Plus size={14} /> Add another member
        </button>

        {error && <div className="errorBox">{error}</div>}

        <button
          className="primary fullButton"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="spin" size={16} /> : <Users size={16} />}
          Create group
        </button>
      </div>
    </Modal>
  );
}

function GroupWorkspace({
  groupId,
  wallet,
  connector,
  onDeleted,
}: {
  groupId: string;
  wallet: string;
  connector?: Connector;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [showExpense, setShowExpense] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [copied, setCopied] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [expenseFilter, setExpenseFilter] = useState<"all" | "pending" | "settled">("all");

  const detail = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api<GroupDetail>("/api/groups/" + groupId),
    refetchInterval: 5_000,
  });

  const settlement = useMutation({
    mutationFn: () =>
      api("/api/groups/" + groupId + "/settlements", { method: "POST" }),
    onSuccess: async () => {
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "Unable to calculate settlement"),
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
      setActionError(e instanceof Error ? e.message : "Unable to cancel settlement"),
  });

  const recalculateSettlement = useMutation({
    mutationFn: () =>
      api("/api/groups/" + groupId + "/settlements?recalculate=1", {
        method: "POST",
      }),
    onSuccess: async () => {
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "Unable to recalculate settlement"),
  });

  const deleteExpense = useMutation({
    mutationFn: (expenseId: string) =>
      api("/api/expenses/" + expenseId, { method: "DELETE" }),
    onSuccess: async () => {
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "Unable to delete expense"),
  });

  const deleteGroup = useMutation({
    mutationFn: () => api("/api/groups/" + groupId, { method: "DELETE" }),
    onSuccess: async () => {
      setActionError("");
      queryClient.removeQueries({ queryKey: ["group", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      onDeleted();
    },
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "Unable to delete group"),
  });

  async function copyText(value: string, key: string) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      setActionError("Unable to copy. Press and hold the value to copy it manually.");
    }
  }

  async function copyPaymentLink(token: string) {
    await copyText(window.location.origin + "/pay/" + token, token);
  }

  async function sharePaymentLink(token: string, description: string) {
    const url = window.location.origin + "/pay/" + token;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SplitFlow payment request",
          text: description + " · USDC on Arc",
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyText(url, token);
  }

  async function payTransfer(transfer: SettlementTransfer) {
    if (!connector) {
      setActionError("Connect the wallet that owes this transfer.");
      return;
    }

    setPayingId(transfer.id);
    setActionError("");

    try {
      const result = await sendUsdcWithCircle(
        connector,
        transfer.to_wallet,
        transfer.amount_usdc,
      );
      const txHash = extractTxHash(result);

      if (!txHash) {
        throw new Error("No Arc transaction hash was returned");
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

  if (detail.isLoading) {
    return <div className="surface"><LoadingLine /></div>;
  }

  if (detail.error || !detail.data) {
    return (
      <div className="surface">
        <div className="errorBox">
          <div>
            {detail.error instanceof Error ? detail.error.message : "Unable to load group"}
          </div>
          <button className="secondary retryButton" onClick={() => detail.refetch()}>
            <RefreshCw size={14} /> Retry group
          </button>
        </div>
      </div>
    );
  }

  const data = detail.data;
  const canManageGroup = data.viewerRole === "owner" || data.viewerRole === "admin";
  const memberByWallet = new Map(
    data.members.map((member) => [member.wallet_address.toLowerCase(), member]),
  );
  const expenseById = new Map(data.expenses.map((expense) => [expense.id, expense]));

  const pendingSplits = data.splits.filter((split) => split.status === "pending");
  const paidSplits = data.splits.filter((split) => split.status === "paid");
  const groupTotal = data.expenses.reduce(
    (sum, expense) => sum + Number(expense.amount_usdc),
    0,
  );
  const pendingTotal = pendingSplits.reduce(
    (sum, split) => sum + Number(split.amount_usdc),
    0,
  );
  const youOwe = pendingSplits
    .filter((split) => split.wallet_address.toLowerCase() === wallet.toLowerCase())
    .reduce((sum, split) => sum + Number(split.amount_usdc), 0);
  const owedToYou = pendingSplits
    .filter((split) => {
      const expense = expenseById.get(split.expense_id);
      return expense?.paid_by.toLowerCase() === wallet.toLowerCase();
    })
    .reduce((sum, split) => sum + Number(split.amount_usdc), 0);

  const progress =
    data.splits.length === 0
      ? 0
      : Math.round((paidSplits.length / data.splits.length) * 100);

  const openRound = data.settlementRounds.find((round) => round.status === "open");
  const planTransfers = openRound
    ? data.settlementTransfers.filter((transfer) => transfer.round_id === openRound.id)
    : [];
  const planHasPayments = planTransfers.some((transfer) => transfer.status === "paid");
  const transfersSaved = Math.max(0, pendingSplits.length - planTransfers.length);
  const savingsPercent =
    pendingSplits.length > 0
      ? Math.round((transfersSaved / pendingSplits.length) * 100)
      : 0;

  const filteredExpenses = data.expenses.filter((expense) => {
    const splits = data.splits.filter((split) => split.expense_id === expense.id);
    const settled = splits.length > 0 && splits.every((split) => split.status === "paid");
    const matchesFilter =
      expenseFilter === "all" ||
      (expenseFilter === "settled" && settled) ||
      (expenseFilter === "pending" && !settled);
    const matchesQuery = expense.description
      .toLowerCase()
      .includes(expenseQuery.trim().toLowerCase());
    return matchesFilter && matchesQuery;
  });

  function exportCsv() {
    const header = [
      "Expense",
      "Amount USDC",
      "Paid by",
      "Split",
      "Paid members",
      "Members",
      "Created",
    ];

    const rows = data.expenses.map((expense) => {
      const splits = data.splits.filter((split) => split.expense_id === expense.id);
      const payer = memberByWallet.get(expense.paid_by.toLowerCase());
      return [
        expense.description,
        expense.amount_usdc,
        displayName(payer, expense.paid_by, wallet),
        expense.split_type,
        String(splits.filter((split) => split.status === "paid").length),
        String(splits.length),
        new Date(expense.created_at).toISOString(),
      ];
    });

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => '"' + String(cell).replaceAll('"', '""') + '"')
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      data.group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-splitflow.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="workspaceStack">
      <section className="groupTop">
        <div>
          <div className="kicker">Group overview</div>
          <h1>{data.group.name}</h1>
          <div className="groupMeta">
            <span>{data.members.length} members</span>
            <span>·</span>
            <span>{data.expenses.length} expenses</span>
            <span>·</span>
            <span>{progress}% settled</span>
          </div>
        </div>

        <div className="headerActions">
          {data.viewerRole === "owner" && (
            <button
              className="dangerButton"
              disabled={deleteGroup.isPending}
              onClick={() => {
                const confirmed = window.confirm(
                  'Delete "' +
                    data.group.name +
                    '"? This permanently removes the group, its expenses, settlements, and transaction records.',
                );
                if (confirmed) deleteGroup.mutate();
              }}
            >
              {deleteGroup.isPending ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Trash2 size={15} />
              )}
              {deleteGroup.isPending ? "Deleting…" : "Delete group"}
            </button>
          )}
          <button
            className="secondary"
            disabled={Boolean(openRound) || !canManageGroup}
            title={!canManageGroup ? "Only the group owner or an admin can add members" : undefined}
            onClick={() => setShowMember(true)}
          >
            <UserPlus size={15} /> Add member
          </button>
          <button
            className="primary"
            disabled={Boolean(openRound)}
            onClick={() => setShowExpense(true)}
          >
            <Plus size={15} /> Add expense
          </button>
        </div>
      </section>

      <section className="statGrid">
        <StatCard label="Group spend" value={money(groupTotal)} note="Recorded expenses" />
        <StatCard label="Pending" value={money(pendingTotal)} note={pendingSplits.length + " open requests"} tone="amber" />
        <StatCard label="You owe" value={money(youOwe)} note="Your pending share" />
        <StatCard label="Owed to you" value={money(owedToYou)} note="Pending to your wallet" tone="green" />
      </section>

      <section className="surface progressSurface">
        <div className="progressHeader">
          <div>
            <span className="sectionEyebrow">Settlement progress</span>
            <b>{progress}% complete</b>
          </div>
          <span>{paidSplits.length} of {data.splits.length} shares paid</span>
        </div>
        <div className="progressTrack">
          <div className="progressFill" style={{ width: progress + "%" }} />
        </div>
      </section>

      <section className="surface">
        <div className="sectionTitle">
          <div>
            <span className="sectionEyebrow">Members</span>
            <h2>Who is in this group</h2>
          </div>
        </div>

        <div className="memberGrid">
          {data.members.map((member) => {
            const name = displayName(member, member.wallet_address, wallet);
            return (
              <div className="memberCard" key={member.id}>
                <div className="memberAvatar">{name.slice(0, 2).toUpperCase()}</div>
                <div className="memberInfo">
                  <b>{name}</b>
                  <span>{shortAddress(member.wallet_address)} · {member.role}</span>
                </div>
                <button
                  className="copyButton"
                  title="Copy wallet"
                  onClick={() => copyText(member.wallet_address, member.id)}
                >
                  {copied === member.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface">
        <div className="sectionTitle settlementHeader">
          <div>
            <span className="sectionEyebrow">Net settlement</span>
            <h2>Settle with fewer transfers</h2>
            <p>
              Combine the group’s pending balances before anyone pays.
            </p>
          </div>
          {!openRound && pendingSplits.length > 0 && (
            <button
              className="secondary"
              disabled={settlement.isPending}
              onClick={() => settlement.mutate()}
            >
              {settlement.isPending ? <Loader2 className="spin" size={15} /> : <ArrowRight size={15} />}
              Calculate
            </button>
          )}
        </div>

        {pendingSplits.length === 0 ? (
          <div className="settledMessage">
            <Check size={16} /> Nothing left to settle.
          </div>
        ) : openRound ? (
          <>
            <div className="netSummary">
              <span>{pendingSplits.length} requests</span>
              <ArrowRight size={15} />
              <b>{planTransfers.length} transfers</b>
              <span className="savingsPill">
                {transfersSaved} fewer · {savingsPercent}% reduction
              </span>
              {planHasPayments ? (
                <button
                  className="textButton"
                  disabled={recalculateSettlement.isPending}
                  onClick={() => recalculateSettlement.mutate()}
                >
                  <RotateCcw size={13} />
                  {recalculateSettlement.isPending
                    ? "Recalculating…"
                    : "Recalculate remaining"}
                </button>
              ) : (
                <button
                  className="textButton dangerText"
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
                    <div className="transferRoute">
                      <div>
                        <span>From</span>
                        <b>
                          {displayName(
                            memberByWallet.get(transfer.from_wallet.toLowerCase()),
                            transfer.from_wallet,
                            wallet,
                          )}
                        </b>
                      </div>
                      <ArrowRight size={15} />
                      <div>
                        <span>To</span>
                        <b>
                          {displayName(
                            memberByWallet.get(transfer.to_wallet.toLowerCase()),
                            transfer.to_wallet,
                            wallet,
                          )}
                        </b>
                      </div>
                    </div>

                    <div className="transferAction">
                      <b>{money(transfer.amount_usdc)}</b>
                      {transfer.status === "paid" ? (
                        <span className="statusPaid"><Check size={13} /> Paid</span>
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
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="emptyLine">
            {pendingSplits.length} pending requests are ready to net.
          </div>
        )}

        {actionError && <div className="errorBox">{actionError}</div>}
      </section>

      <section className="surface">
        <div className="sectionTitle expenseHeader">
          <div>
            <span className="sectionEyebrow">Expenses</span>
            <h2>{data.expenses.length} recorded</h2>
          </div>
          <div className="toolbar">
            <button className="textButton" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
            <button
              className="primary"
              disabled={Boolean(openRound)}
              onClick={() => setShowExpense(true)}
            >
              <Plus size={14} /> Add expense
            </button>
          </div>
        </div>

        <div className="filters">
          <div className="searchBox">
            <Search size={15} />
            <input
              placeholder="Search expenses"
              value={expenseQuery}
              onChange={(e) => setExpenseQuery(e.target.value)}
            />
          </div>
          <div className="filterTabs">
            {(["all", "pending", "settled"] as const).map((filter) => (
              <button
                key={filter}
                className={expenseFilter === filter ? "activeFilter" : ""}
                onClick={() => setExpenseFilter(filter)}
              >
                {filter[0].toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="emptyState compact">
            <ReceiptText size={21} />
            <b>{data.expenses.length ? "No matching expenses" : "No expenses yet"}</b>
            {!data.expenses.length && <span>Add the first expense to start splitting.</span>}
          </div>
        ) : (
          <div className="expenseList">
            {filteredExpenses.map((expense) => {
              const expenseSplits = data.splits.filter(
                (split) => split.expense_id === expense.id,
              );
              const hasExternalPaidSplit = expenseSplits.some(
                (split) =>
                  split.wallet_address.toLowerCase() !==
                    expense.paid_by.toLowerCase() &&
                  split.status === "paid",
              );
              const canDeleteExpense =
                !openRound &&
                !hasExternalPaidSplit &&
                (canManageGroup ||
                  expense.created_by.toLowerCase() === wallet.toLowerCase());

              return (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  splits={expenseSplits}
                  members={data.members}
                  currentWallet={wallet}
                  copied={copied}
                  copyPaymentLink={copyPaymentLink}
                  sharePaymentLink={sharePaymentLink}
                  canDelete={canDeleteExpense}
                  deleting={deleteExpense.isPending && deleteExpense.variables === expense.id}
                  onDelete={() => {
                    if (
                      window.confirm(
                        "Delete this unpaid expense? This cannot be undone.",
                      )
                    ) {
                      deleteExpense.mutate(expense.id);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="surface">
        <div className="sectionTitle">
          <div>
            <span className="sectionEyebrow">Activity</span>
            <h2>Verified Arc transactions</h2>
          </div>
          <span className="countBadge">{data.transactions.length}</span>
        </div>

        {data.transactions.length === 0 ? (
          <div className="emptyLine">Confirmed payments will appear here.</div>
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
                <div className="txIcon"><Check size={14} /></div>
                <div className="activityMain">
                  <b>{shortAddress(tx.from_wallet)} → {shortAddress(tx.to_wallet)}</b>
                  <span>{new Date(tx.created_at).toLocaleString()}</span>
                </div>
                <div className="txAmount">
                  {money(tx.amount_usdc)}
                  <ExternalLink size={13} />
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

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

      {showMember && (
        <AddMemberModal
          groupId={groupId}
          onClose={() => setShowMember(false)}
          onAdded={async () => {
            setShowMember(false);
            await queryClient.invalidateQueries({ queryKey: ["group", groupId] });
            await queryClient.invalidateQueries({ queryKey: ["groups"] });
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "amber" | "green";
}) {
  return (
    <div className="statCard">
      <span>{label}</span>
      <b className={tone || ""}>{value}</b>
      <small>{note}</small>
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
  sharePaymentLink,
  canDelete,
  deleting,
  onDelete,
}: {
  expense: Expense;
  splits: ExpenseSplit[];
  members: GroupMember[];
  currentWallet: string;
  copied: string;
  copyPaymentLink: (token: string) => void;
  sharePaymentLink: (token: string, description: string) => void;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const payer = members.find(
    (member) => member.wallet_address.toLowerCase() === expense.paid_by.toLowerCase(),
  );
  const paidCount = splits.filter((split) => split.status === "paid").length;
  const settled = splits.length > 0 && paidCount === splits.length;
  const percent = splits.length ? Math.round((paidCount / splits.length) * 100) : 0;

  return (
    <article className="expenseCard">
      <div className="expenseTop">
        <div>
          <div className="expenseTitleRow">
            <b>{expense.description}</b>
            <span className={settled ? "statusPaid" : "statusPending"}>
              {settled ? "Settled" : "Pending"}
            </span>
            {canDelete && (
              <button
                className="deleteExpenseButton"
                title="Delete unpaid expense"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? <Loader2 className="spin" size={12} /> : <Trash2 size={12} />}
              </button>
            )}
          </div>
          <span>
            Paid by {displayName(payer, expense.paid_by, currentWallet)}
            {" · "}
            {expense.split_type === "equal" ? "Equal split" : "Custom split"}
          </span>
        </div>
        <div className="expenseAmount">
          {money(expense.amount_usdc)}
          <small>{paidCount}/{splits.length} paid</small>
        </div>
      </div>

      <div className="miniProgress">
        <div style={{ width: percent + "%" }} />
      </div>

      <div className="splitRows">
        {splits.map((split) => {
          const member = members.find(
            (item) =>
              item.wallet_address.toLowerCase() === split.wallet_address.toLowerCase(),
          );
          const isPayer =
            split.wallet_address.toLowerCase() === expense.paid_by.toLowerCase();
          const isCurrentWallet =
            split.wallet_address.toLowerCase() === currentWallet.toLowerCase();

          return (
            <div className="splitRow" key={split.id}>
              <div>
                <b>{displayName(member, split.wallet_address, currentWallet)}</b>
                <span>{money(split.amount_usdc)}</span>
              </div>

              <div className="splitActions">
                {split.status === "paid" ? (
                  <span className="statusPaid"><Check size={12} /> Paid</span>
                ) : split.locked_by_settlement ? (
                  <span className="statusPending">In net plan</span>
                ) : (
                  <>
                    <span className="statusPending">Pending</span>
                    {!isPayer && (
                      isCurrentWallet ? (
                        <button
                          className="paySplitButton"
                          onClick={() =>
                            window.location.assign("/pay/" + split.payment_token)
                          }
                        >
                          <Send size={13} /> Pay my split
                        </button>
                      ) : (
                        <>
                          <button
                            className="copyLinkButton"
                            onClick={() => copyPaymentLink(split.payment_token)}
                          >
                            {copied === split.payment_token ? (
                              <Check size={13} />
                            ) : (
                              <Copy size={13} />
                            )}
                            {copied === split.payment_token ? "Copied" : "Copy pay link"}
                          </button>
                          <button
                            className="copyLinkButton mobileOnly"
                            onClick={() =>
                              sharePaymentLink(split.payment_token, expense.description)
                            }
                          >
                            <Share2 size={13} /> Share
                          </button>
                        </>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function AddMemberModal({
  groupId,
  onClose,
  onAdded,
}: {
  groupId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api("/api/groups/" + groupId + "/members", {
        method: "POST",
        body: JSON.stringify({ name, wallet }),
      }),
    onSuccess: onAdded,
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Unable to add member"),
  });

  return (
    <Modal title="Add member" subtitle="Add another Arc-compatible wallet to this group." onClose={onClose}>
      <div className="form">
        <label>
          Name
          <input
            className="input"
            placeholder="Alex"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Wallet address
          <input
            className="input"
            placeholder="0x…"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
        </label>

        {error && <div className="errorBox">{error}</div>}

        <button
          className="primary fullButton"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="spin" size={16} /> : <UserPlus size={16} />}
          Add member
        </button>
      </div>
    </Modal>
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
          ? group.members.map((member) => ({
              wallet: member.wallet_address,
              amount: custom[member.wallet_address] || "0",
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
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Unable to create expense"),
  });

  const equalPreview =
    splitType === "equal" && Number(amount) > 0
      ? Number(amount) / Math.max(group.members.length, 1)
      : 0;

  return (
    <Modal title="Add expense" subtitle={group.group.name} onClose={onClose} wide>
      <div className="form">
        <label>
          Expense
          <input
            className="input"
            placeholder="Dinner"
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
              {group.members.map((member) => (
                <option value={member.wallet_address} key={member.id}>
                  {displayName(member, member.wallet_address, wallet)}
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
            {group.members.map((member) => (
              <div key={member.id}>
                <span>{displayName(member, member.wallet_address, wallet)}</span>
                <b>{money(equalPreview)}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="splitPreview">
            {group.members.map((member) => (
              <label key={member.id}>
                <span>{displayName(member, member.wallet_address, wallet)}</span>
                <input
                  className="miniInput"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={custom[member.wallet_address] || ""}
                  onChange={(e) =>
                    setCustom((current) => ({
                      ...current,
                      [member.wallet_address]: e.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        )}

        {error && <div className="errorBox">{error}</div>}

        <button
          className="primary fullButton"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="spin" size={16} /> : <ReceiptText size={16} />}
          Save expense
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div
        className={"modal surface " + (wide ? "wideModal" : "")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="iconButton" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
