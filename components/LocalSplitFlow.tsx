"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  ListFilter,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { formatUnits, getAddress, isAddress, parseUnits } from "viem";
import {
  buildNetBalances,
  optimizeSettlements,
  type Obligation,
} from "../lib/settlement";

type ViewTab = "overview" | "expenses" | "members" | "settlement" | "activity";
type ExpenseFilter = "all" | "pending" | "paid";
type Density = "compact" | "detailed";
type SplitType = "equal" | "custom";

type Member = {
  wallet: string;
  name: string;
};

type Split = {
  wallet: string;
  amount: string;
  status: "pending" | "paid";
  paymentId: string;
};

type Expense = {
  id: string;
  description: string;
  amount: string;
  paidBy: string;
  splitType: SplitType;
  splits: Split[];
  createdAt: string;
};

type Activity = {
  id: string;
  message: string;
  kind: "group" | "expense" | "member" | "settlement" | "share";
  createdAt: string;
};

type Group = {
  id: string;
  name: string;
  emoji: string;
  members: Member[];
  expenses: Expense[];
  activities: Activity[];
  createdAt: string;
};

function uid() {
  return crypto.randomUUID();
}

function short(value: string) {
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function money(value: string | number) {
  return "$" + Number(value || 0).toFixed(2);
}

function storageKey(wallet: string) {
  return "splitflow_local_v4_" + wallet.toLowerCase();
}

function label(group: Group, wallet: string, current: string) {
  if (wallet.toLowerCase() === current.toLowerCase()) return "You";
  return (
    group.members.find((member) => member.wallet === wallet.toLowerCase())?.name ||
    short(wallet)
  );
}

function equalSplit(total: bigint, count: number) {
  const base = total / BigInt(count);
  let remainder = total % BigInt(count);
  return Array.from({ length: count }, () => {
    const extra = remainder > 0n ? 1n : 0n;
    if (remainder > 0n) remainder -= 1n;
    return base + extra;
  });
}

function activity(message: string, kind: Activity["kind"]): Activity {
  return {
    id: uid(),
    message,
    kind,
    createdAt: new Date().toISOString(),
  };
}

function expenseStatus(expense: Expense): "pending" | "paid" {
  return expense.splits.every((split) => split.status === "paid")
    ? "paid"
    : "pending";
}

function demoGroup(wallet: string): Group {
  const alex = "0x1111111111111111111111111111111111111111";
  const sam = "0x2222222222222222222222222222222222222222";
  const ryan = "0x3333333333333333333333333333333333333333";
  const createdAt = new Date().toISOString();

  return {
    id: uid(),
    name: "Goa Trip",
    emoji: "🏖️",
    createdAt,
    members: [
      { wallet, name: "You" },
      { wallet: alex, name: "Alex" },
      { wallet: sam, name: "Sam" },
      { wallet: ryan, name: "Ryan" },
    ],
    expenses: [
      {
        id: uid(),
        description: "Beach dinner",
        amount: "120",
        paidBy: wallet,
        splitType: "equal",
        createdAt,
        splits: [
          { wallet, amount: "30", status: "paid", paymentId: uid() },
          { wallet: alex, amount: "30", status: "pending", paymentId: uid() },
          { wallet: sam, amount: "30", status: "paid", paymentId: uid() },
          { wallet: ryan, amount: "30", status: "pending", paymentId: uid() },
        ],
      },
      {
        id: uid(),
        description: "Airport taxi",
        amount: "64",
        paidBy: alex,
        splitType: "equal",
        createdAt,
        splits: [
          { wallet, amount: "16", status: "pending", paymentId: uid() },
          { wallet: alex, amount: "16", status: "paid", paymentId: uid() },
          { wallet: sam, amount: "16", status: "pending", paymentId: uid() },
          { wallet: ryan, amount: "16", status: "pending", paymentId: uid() },
        ],
      },
      {
        id: uid(),
        description: "Water sports",
        amount: "80",
        paidBy: sam,
        splitType: "equal",
        createdAt,
        splits: [
          { wallet, amount: "20", status: "pending", paymentId: uid() },
          { wallet: alex, amount: "20", status: "pending", paymentId: uid() },
          { wallet: sam, amount: "20", status: "paid", paymentId: uid() },
          { wallet: ryan, amount: "20", status: "pending", paymentId: uid() },
        ],
      },
    ],
    activities: [
      activity("Smart settlement preview calculated", "settlement"),
      activity("Water sports expense added · 80 USDC", "expense"),
      activity("Airport taxi expense added · 64 USDC", "expense"),
      activity("Beach dinner expense added · 120 USDC", "expense"),
      activity("Demo group created with 4 members", "group"),
    ],
  };
}

async function safeCopy(value: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

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

function requestUrl(split: Split, expense: Expense, group: Group) {
  const params = new URLSearchParams({
    pid: split.paymentId,
    from: split.wallet,
    to: expense.paidBy,
    amount: split.amount,
    label: expense.description,
    group: group.name,
  });
  return window.location.origin + "/pay/local?" + params.toString();
}

export default function LocalSplitFlow({
  wallet,
  balanceLabel,
}: {
  wallet: string;
  balanceLabel?: string;
}) {
  const current = wallet.toLowerCase();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [filter, setFilter] = useState<ExpenseFilter>("all");
  const [density, setDensity] = useState<Density>("detailed");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(current));
      const parsed = raw ? (JSON.parse(raw) as Group[]) : [];
      const safe = Array.isArray(parsed) ? parsed : [];
      setGroups(safe);
      setSelectedId(safe[0]?.id || null);
    } catch {
      setGroups([]);
      setSelectedId(null);
    } finally {
      setHydrated(true);
    }
  }, [current]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey(current), JSON.stringify(groups));
    } catch {
      // The UI remains usable even if persistence is blocked by the browser.
    }
  }, [groups, current, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = useMemo(
    () => groups.find((group) => group.id === selectedId) || null,
    [groups, selectedId],
  );

  function saveGroup(group: Group) {
    setGroups((all) =>
      all.map((item) => (item.id === group.id ? group : item)),
    );
  }

  function addDemoGroup() {
    const next = demoGroup(current);
    setGroups((all) => [next, ...all]);
    setSelectedId(next.id);
    setActiveTab("overview");
    setToast("Demo group created");
  }

  async function shareText(title: string, text: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        setToast("Shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await safeCopy(text);
    setToast("Copied to clipboard");
  }

  function exportCsv(group: Group) {
    const rows = [
      ["Expense", "Amount USDC", "Paid by", "Split", "Created"],
      ...group.expenses.map((expense) => [
        expense.description,
        expense.amount,
        label(group, expense.paidBy, current),
        expense.splitType,
        expense.createdAt,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
      "-splitflow.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("CSV exported");
  }

  return (
    <>
      <section className={"appLayout localWorkspace " + density}>
        <aside className="sidePanel professionalSidebar">
          <div className="sideHeader">
            <div>
              <span className="sideLabel">Groups</span>
              <b>{groups.length}</b>
            </div>
            <button
              className="iconButton"
              title="New group"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={17} />
            </button>
          </div>

          <div className="modeCard">
            <div>
              <span className="modeStatus">
                <i className="networkDot" /> Local Workspace
              </span>
              <small>Data is saved on this device</small>
            </div>
            <div className="miniSegment">
              <button
                title="Cloud sync unavailable"
                onClick={() =>
                  setToast("Cloud sync unavailable — Local Workspace is active")
                }
              >
                Cloud
              </button>
              <button className="active">Local</button>
            </div>
          </div>

          <button
            className="newGroupSidebar"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={15} /> New Group
          </button>

          {groups.length === 0 ? (
            <div className="sidebarEmpty">
              <div className="sidebarEmptyIcon"><Users size={17} /></div>
              <b>No groups yet</b>
              <span>Create one or load the demo workspace.</span>
            </div>
          ) : (
            <div className="groupList">
              {groups.map((group) => {
                const pending = group.expenses
                  .flatMap((expense) => expense.splits)
                  .filter((split) => split.status === "pending").length;

                return (
                  <button
                    key={group.id}
                    className={
                      "groupButton " +
                      (selectedId === group.id ? "groupButtonActive" : "")
                    }
                    onClick={() => {
                      setSelectedId(group.id);
                      setActiveTab("overview");
                    }}
                  >
                    <div className="groupEmoji">{group.emoji}</div>
                    <div className="groupButtonBody">
                      <b>{group.name}</b>
                      <span>
                        {group.members.length} members · {group.expenses.length} expenses
                      </span>
                    </div>
                    <div className={pending > 0 ? "pendingBadge" : "doneBadge"}>
                      {pending > 0 ? pending : <Check size={13} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="sidebarStats">
            <div>
              <span>Network</span>
              <b><i className="networkDot" /> Arc Testnet</b>
            </div>
            <div>
              <span>Balance</span>
              <b>{balanceLabel || "—"} USDC</b>
            </div>
            <div>
              <span>Wallet</span>
              <b>{short(current)}</b>
            </div>
          </div>
        </aside>

        <section className="workspace">
          {!selected ? (
            <EmptyWorkspace
              onCreate={() => setShowCreate(true)}
              onDemo={addDemoGroup}
              onHow={() => setShowHow(true)}
            />
          ) : (
            <GroupView
              group={selected}
              wallet={current}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              filter={filter}
              setFilter={setFilter}
              density={density}
              setDensity={setDensity}
              search={search}
              setSearch={setSearch}
              onNewGroup={() => setShowCreate(true)}
              onAddExpense={() => setShowExpense(true)}
              onAddMember={() => setShowMember(true)}
              onExport={() => exportCsv(selected)}
              onShare={() =>
                shareText(
                  "SplitFlow group",
                  selected.emoji +
                    " " +
                    selected.name +
                    " · " +
                    selected.members.length +
                    " members · " +
                    selected.expenses.length +
                    " expenses · SplitFlow on Arc",
                )
              }
              onSave={saveGroup}
              onToast={setToast}
              onQr={setQrUrl}
            />
          )}
        </section>
      </section>

      {showCreate && (
        <CreateModal
          wallet={current}
          onClose={() => setShowCreate(false)}
          onCreate={(group) => {
            setGroups((all) => [group, ...all]);
            setSelectedId(group.id);
            setActiveTab("overview");
            setShowCreate(false);
            setToast("Group created");
          }}
        />
      )}

      {selected && showMember && (
        <MemberModal
          group={selected}
          onClose={() => setShowMember(false)}
          onCreate={(member) => {
            saveGroup({
              ...selected,
              members: [...selected.members, member],
              activities: [
                activity(member.name + " added to the group", "member"),
                ...(selected.activities || []),
              ].slice(0, 30),
            });
            setShowMember(false);
            setToast("Member added");
          }}
        />
      )}

      {selected && showExpense && (
        <ExpenseModal
          group={selected}
          wallet={current}
          onClose={() => setShowExpense(false)}
          onCreate={(expense) => {
            saveGroup({
              ...selected,
              expenses: [expense, ...selected.expenses],
              activities: [
                activity(
                  expense.description +
                    " added · " +
                    Number(expense.amount).toFixed(2) +
                    " USDC",
                  "expense",
                ),
                ...(selected.activities || []),
              ].slice(0, 30),
            });
            setShowExpense(false);
            setToast("Expense added");
          }}
        />
      )}

      {showHow && <HowModal onClose={() => setShowHow(false)} />}
      {qrUrl && <QrModal url={qrUrl} onClose={() => setQrUrl("")} />}
      {toast && <div className="toast"><Check size={14} /> {toast}</div>}
    </>
  );
}

function EmptyWorkspace({
  onCreate,
  onDemo,
  onHow,
}: {
  onCreate: () => void;
  onDemo: () => void;
  onHow: () => void;
}) {
  return (
    <div className="premiumEmpty">
      <div className="emptyHero">
        <div className="emptyHeroMark"><WalletCards size={24} /></div>
        <div className="kicker">USDC group settlement on Arc</div>
        <h1>Create your first SplitFlow group</h1>
        <p>
          Track shared expenses, generate payment requests, and reduce
          settlements into fewer USDC transfers on Arc.
        </p>
      </div>

      <div className="featureTriptych">
        <div>
          <div className="featureIcon"><Users size={18} /></div>
          <span>01</span>
          <b>Add members</b>
          <p>Invite wallets and keep every shared expense organized.</p>
        </div>
        <div>
          <div className="featureIcon"><ReceiptText size={18} /></div>
          <span>02</span>
          <b>Record expenses</b>
          <p>Use equal or custom USDC splits with exact arithmetic.</p>
        </div>
        <div>
          <div className="featureIcon"><Sparkles size={18} /></div>
          <span>03</span>
          <b>Optimize settlement</b>
          <p>Reduce many debts into fewer final transfers.</p>
        </div>
      </div>

      <div className="emptyActions">
        <button className="primary" onClick={onCreate}>
          <Plus size={16} /> Create Group
        </button>
        <button className="secondary" onClick={onDemo}>
          <Sparkles size={16} /> Try Demo Group
        </button>
        <button className="ghostButton" onClick={onHow}>
          How it works <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function GroupView({
  group,
  wallet,
  activeTab,
  setActiveTab,
  filter,
  setFilter,
  density,
  setDensity,
  search,
  setSearch,
  onNewGroup,
  onAddExpense,
  onAddMember,
  onExport,
  onShare,
  onSave,
  onToast,
  onQr,
}: {
  group: Group;
  wallet: string;
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  filter: ExpenseFilter;
  setFilter: (filter: ExpenseFilter) => void;
  density: Density;
  setDensity: (density: Density) => void;
  search: string;
  setSearch: (value: string) => void;
  onNewGroup: () => void;
  onAddExpense: () => void;
  onAddMember: () => void;
  onExport: () => void;
  onShare: () => void;
  onSave: (group: Group) => void;
  onToast: (message: string) => void;
  onQr: (url: string) => void;
}) {
  const allSplits = group.expenses.flatMap((expense) => expense.splits);
  const pendingSplits = allSplits.filter((split) => split.status === "pending");
  const paidSplits = allSplits.filter((split) => split.status === "paid");
  const total = group.expenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0,
  );
  const pendingTotal = pendingSplits.reduce(
    (sum, split) => sum + Number(split.amount),
    0,
  );
  const progress = allSplits.length
    ? Math.round((paidSplits.length / allSplits.length) * 100)
    : 0;

  const obligations: Obligation[] = [];
  for (const expense of group.expenses) {
    for (const split of expense.splits) {
      if (split.status === "pending" && split.wallet !== expense.paidBy) {
        obligations.push({
          debtor: split.wallet,
          creditor: expense.paidBy,
          units: parseUnits(split.amount, 6),
        });
      }
    }
  }

  const plan = obligations.length
    ? optimizeSettlements(buildNetBalances(obligations))
    : [];
  const savedTransfers = Math.max(0, obligations.length - plan.length);
  const savingsPercent = obligations.length
    ? Math.round((savedTransfers / obligations.length) * 100)
    : 0;

  const filteredExpenses = group.expenses.filter((expense) => {
    const status = expenseStatus(expense);
    const matchesFilter = filter === "all" || status === filter;
    const matchesSearch = expense.description
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="workspaceStack">
      <section className="workspaceHeader">
        <div className="groupTitleLine">
          <div className="groupHeroEmoji">{group.emoji}</div>
          <div>
            <div className="kicker">Shared expense workspace</div>
            <h1>{group.name}</h1>
            <p>
              {group.members.length} members · {group.expenses.length} expenses · {progress}% settled
            </p>
          </div>
        </div>

        <div className="densityToggle">
          <button
            className={density === "compact" ? "active" : ""}
            onClick={() => setDensity("compact")}
          >
            Compact
          </button>
          <button
            className={density === "detailed" ? "active" : ""}
            onClick={() => setDensity("detailed")}
          >
            Detailed
          </button>
        </div>
      </section>

      <section className="quickBar">
        <button onClick={onNewGroup}><Plus size={14} /> New Group</button>
        <button onClick={onAddExpense}><ReceiptText size={14} /> Add Expense</button>
        <button onClick={() => setActiveTab("settlement")}><Sparkles size={14} /> Settle Group</button>
        <button onClick={onShare}><Share2 size={14} /> Share</button>
        <button onClick={onExport}><Download size={14} /> Export CSV</button>
      </section>

      <section className="topTabs">
        {([
          ["overview", "Overview"],
          ["expenses", "Expenses"],
          ["members", "Members"],
          ["settlement", "Settlement"],
          ["activity", "Activity"],
        ] as [ViewTab, string][]).map(([tab, text]) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {text}
          </button>
        ))}
      </section>

      {activeTab === "overview" && (
        <>
          <section className="statGrid">
            <div className="statCard">
              <span>Total Group Spend</span>
              <b>{money(total)}</b>
              <small>Recorded in USDC</small>
            </div>
            <div className="statCard">
              <span>Pending Amount</span>
              <b className="amber">{money(pendingTotal)}</b>
              <small>{pendingSplits.length} open shares</small>
            </div>
            <div className="statCard">
              <span>Members</span>
              <b>{group.members.length}</b>
              <small>Wallets in this group</small>
            </div>
            <div className="statCard">
              <span>Settlement Savings</span>
              <b className="green">{savedTransfers}</b>
              <small>{savingsPercent}% fewer transfers</small>
            </div>
          </section>

          <section className="surface progressSurface">
            <div className="progressHeader">
              <div>
                <span className="sectionEyebrow">Settlement progress</span>
                <b>{progress}% complete</b>
              </div>
              <span>{paidSplits.length} of {allSplits.length} shares paid</span>
            </div>
            <div className="progressTrack">
              <div className="progressFill" style={{ width: progress + "%" }} />
            </div>
          </section>

          <section className="surface smartPreview">
            <div className="sectionTitle">
              <div>
                <span className="sectionEyebrow">Smart Settlement Engine</span>
                <h2>Reduce payment complexity before anyone settles</h2>
                <p>
                  Current group: {obligations.length} debts → {plan.length} optimized transfers.
                </p>
              </div>
              <span className="savingsHero">{savedTransfers} saved</span>
            </div>

            <div className="compareGrid">
              <div className="compareCard">
                <span>Before optimization</span>
                {obligations.length ? (
                  obligations.slice(0, 4).map((item, index) => (
                    <div key={index}>
                      <b>{label(group, item.debtor, wallet)}</b>
                      <ArrowRight size={13} />
                      <b>{label(group, item.creditor, wallet)}</b>
                      <em>{money(formatUnits(item.units, 6))}</em>
                    </div>
                  ))
                ) : (
                  <p>No pending debts.</p>
                )}
              </div>
              <div className="compareCard optimized">
                <span>After optimization</span>
                {plan.length ? (
                  plan.slice(0, 4).map((item, index) => (
                    <div key={index}>
                      <b>{label(group, item.from, wallet)}</b>
                      <ArrowRight size={13} />
                      <b>{label(group, item.to, wallet)}</b>
                      <em>{money(formatUnits(item.units, 6))}</em>
                    </div>
                  ))
                ) : (
                  <p>Everything is settled.</p>
                )}
              </div>
            </div>
          </section>

          <section className="overviewGrid">
            <div className="surface">
              <div className="sectionTitle">
                <div>
                  <span className="sectionEyebrow">Members</span>
                  <h2>Group members</h2>
                </div>
                <button className="ghostButton" onClick={onAddMember}>
                  <UserPlus size={14} /> Add
                </button>
              </div>
              <div className="memberChips">
                {group.members.map((member) => (
                  <span key={member.wallet}>
                    <i>{(member.name || "W").slice(0, 1).toUpperCase()}</i>
                    {member.wallet === wallet ? "You" : member.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="surface">
              <div className="sectionTitle">
                <div>
                  <span className="sectionEyebrow">Recent Activity</span>
                  <h2>Latest changes</h2>
                </div>
                <button
                  className="ghostButton"
                  onClick={() => setActiveTab("activity")}
                >
                  View all
                </button>
              </div>
              <ActivityList activities={(group.activities || []).slice(0, 4)} />
            </div>
          </section>
        </>
      )}

      {activeTab === "expenses" && (
        <section className="surface">
          <div className="sectionTitle expenseHeader">
            <div>
              <span className="sectionEyebrow">Expenses</span>
              <h2>{group.expenses.length} recorded</h2>
            </div>
            <button className="primary" onClick={onAddExpense}>
              <Plus size={14} /> Add Expense
            </button>
          </div>

          <div className="expenseToolbar">
            <div className="searchBox">
              <Search size={15} />
              <input
                placeholder="Search expenses"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="filterTabs">
              {(["all", "pending", "paid"] as ExpenseFilter[]).map((item) => (
                <button
                  key={item}
                  className={filter === item ? "activeFilter" : ""}
                  onClick={() => setFilter(item)}
                >
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="emptyState compact">
              <ListFilter size={21} />
              <b>No matching expenses</b>
              <span>Try a different filter or search.</span>
            </div>
          ) : (
            <div className="expenseList">
              {filteredExpenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  group={group}
                  expense={expense}
                  wallet={wallet}
                  onSave={onSave}
                  onToast={onToast}
                  onQr={onQr}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "members" && (
        <section className="surface">
          <div className="sectionTitle">
            <div>
              <span className="sectionEyebrow">Members</span>
              <h2>{group.members.length} wallets</h2>
            </div>
            <button className="primary" onClick={onAddMember}>
              <UserPlus size={14} /> Add Member
            </button>
          </div>

          <div className="memberGrid">
            {group.members.map((member) => (
              <div className="memberCard memberCardLarge" key={member.wallet}>
                <div className="memberAvatar">
                  {(member.name || "W").slice(0, 2).toUpperCase()}
                </div>
                <div className="memberInfo">
                  <b>{member.wallet === wallet ? "You" : member.name}</b>
                  <span>{short(member.wallet)}</span>
                </div>
                <div className="memberStatus">Active</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "settlement" && (
        <section className="surface">
          <div className="sectionTitle settlementHeader">
            <div>
              <span className="sectionEyebrow">Smart Settlement Engine</span>
              <h2>Optimize final settlement</h2>
              <p>
                SplitFlow nets every pending balance using exact micro-USDC arithmetic.
              </p>
            </div>
            <span className="savingsHero">{savedTransfers} transfers saved</span>
          </div>

          <div className="settlementKpis">
            <div>
              <span>Original debts</span>
              <b>{obligations.length}</b>
            </div>
            <ArrowRight size={18} />
            <div>
              <span>Optimized transfers</span>
              <b>{plan.length}</b>
            </div>
            <div>
              <span>Reduction</span>
              <b className="green">{savingsPercent}%</b>
            </div>
          </div>

          {plan.length === 0 ? (
            <div className="settledMessage">
              <Check size={16} /> Nothing left to settle.
            </div>
          ) : (
            <div className="settlementList">
              {plan.map((transfer, index) => (
                <div className="settlementItem" key={index}>
                  <div className="transferRoute">
                    <div>
                      <span>From</span>
                      <b>{label(group, transfer.from, wallet)}</b>
                    </div>
                    <ArrowRight size={15} />
                    <div>
                      <span>To</span>
                      <b>{label(group, transfer.to, wallet)}</b>
                    </div>
                  </div>
                  <div className="transferAction">
                    <b>{money(formatUnits(transfer.units, 6))}</b>
                    <span className="statusPending">Pending</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "activity" && (
        <section className="surface">
          <div className="sectionTitle">
            <div>
              <span className="sectionEyebrow">Activity</span>
              <h2>Recent group history</h2>
            </div>
          </div>
          <ActivityList activities={group.activities || []} />
        </section>
      )}
    </div>
  );
}

function ActivityList({ activities }: { activities: Activity[] }) {
  if (!activities.length) {
    return (
      <div className="emptyLine">
        Activity will appear here as you use SplitFlow.
      </div>
    );
  }

  return (
    <div className="activityTimeline">
      {activities.map((item) => (
        <div key={item.id}>
          <span className={"activityDot " + item.kind} />
          <div>
            <b>{item.message}</b>
            <span>{new Date(item.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpenseCard({
  group,
  expense,
  wallet,
  onSave,
  onToast,
  onQr,
}: {
  group: Group;
  expense: Expense;
  wallet: string;
  onSave: (group: Group) => void;
  onToast: (message: string) => void;
  onQr: (url: string) => void;
}) {
  const paid = expense.splits.filter((split) => split.status === "paid").length;
  const status = expenseStatus(expense);

  async function copyRequest(split: Split) {
    await safeCopy(requestUrl(split, expense, group));
    onToast("Payment link copied");
  }

  async function shareRequest(split: Split) {
    const url = requestUrl(split, expense, group);

    if (navigator.share) {
      try {
        await navigator.share({
          title: "SplitFlow payment request",
          text:
            Number(split.amount).toFixed(2) +
            " USDC · " +
            expense.description,
          url,
        });
        onToast("Payment request shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await safeCopy(url);
    onToast("Payment link copied");
  }

  return (
    <article className="expenseCard">
      <div className="expenseTop">
        <div>
          <div className="expenseTitleRow">
            <b>{expense.description}</b>
            <span className={status === "paid" ? "statusPaid" : "statusPending"}>
              {status === "paid" ? "Paid" : "Pending"}
            </span>
          </div>
          <span>
            Paid by {label(group, expense.paidBy, wallet)} ·{" "}
            {expense.splitType === "equal" ? "Equal" : "Custom"} split
          </span>
        </div>
        <div className="expenseAmount">
          {money(expense.amount)}
          <small>{paid}/{expense.splits.length} paid</small>
        </div>
      </div>

      <div className="miniProgress">
        <div
          style={{
            width:
              Math.round(
                (paid / Math.max(expense.splits.length, 1)) * 100,
              ) + "%",
          }}
        />
      </div>

      <div className="splitRows">
        {expense.splits.map((split) => (
          <div className="splitRow" key={split.paymentId}>
            <div>
              <b>{label(group, split.wallet, wallet)}</b>
              <span>{money(split.amount)}</span>
            </div>
            <div className="splitActions">
              <span
                className={
                  split.status === "paid" ? "statusPaid" : "statusPending"
                }
              >
                {split.status === "paid" ? "Paid" : "Pending"}
              </span>

              {split.status === "pending" && split.wallet !== expense.paidBy && (
                <>
                  <button
                    className="copyLinkButton"
                    onClick={() => copyRequest(split)}
                  >
                    <Copy size={13} /> Copy
                  </button>
                  <button
                    className="copyLinkButton"
                    onClick={() => shareRequest(split)}
                  >
                    <Share2 size={13} /> Share
                  </button>
                  <button
                    className="copyLinkButton"
                    onClick={() => onQr(requestUrl(split, expense, group))}
                  >
                    <QrCode size={13} /> QR
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="expenseFooter">
        <button
          className="dangerButton"
          onClick={() => {
            if (!window.confirm("Delete this expense?")) return;

            onSave({
              ...group,
              expenses: group.expenses.filter((item) => item.id !== expense.id),
              activities: [
                activity(expense.description + " deleted", "expense"),
                ...(group.activities || []),
              ].slice(0, 30),
            });
            onToast("Expense deleted");
          }}
        >
          <Trash2 size={13} /> Delete expense
        </button>
      </div>
    </article>
  );
}

function CreateModal({
  wallet,
  onClose,
  onCreate,
}: {
  wallet: string;
  onClose: () => void;
  onCreate: (group: Group) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💸");
  const [memberName, setMemberName] = useState("");
  const [memberWallet, setMemberWallet] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!name.trim()) return setError("Enter a group name");

    if (!isAddress(memberWallet.trim())) {
      return setError("Enter a valid second wallet address");
    }

    const second = getAddress(memberWallet.trim()).toLowerCase();
    if (second === wallet) return setError("Add a different wallet");

    onCreate({
      id: uid(),
      name: name.trim().slice(0, 80),
      emoji,
      members: [
        { wallet, name: "You" },
        { wallet: second, name: memberName.trim() || short(second) },
      ],
      expenses: [],
      activities: [activity("Group created with 2 members", "group")],
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <Modal
      title="Start a shared expense group"
      subtitle="Invite members by wallet address and begin tracking shared USDC expenses."
      onClose={onClose}
    >
      <div className="form">
        <div className="emojiPicker">
          {["💸", "🏖️", "🍽️", "🏠", "✈️", "🎉"].map((item) => (
            <button
              key={item}
              className={emoji === item ? "active" : ""}
              onClick={() => setEmoji(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <label>
          Group name
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Trip to Goa"
          />
        </label>

        <div className="two">
          <label>
            Member name
            <input
              className="input"
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="Levi"
            />
          </label>
          <label>
            Member wallet
            <input
              className="input walletInput"
              value={memberWallet}
              onChange={(event) => setMemberWallet(event.target.value)}
              placeholder="0x…"
            />
          </label>
        </div>

        {error && <div className="errorBox">{error}</div>}

        <button className="primary fullButton" onClick={submit}>
          <Users size={16} /> Create Group
        </button>
      </div>
    </Modal>
  );
}

function MemberModal({
  group,
  onClose,
  onCreate,
}: {
  group: Group;
  onClose: () => void;
  onCreate: (member: Member) => void;
}) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!isAddress(wallet.trim())) {
      return setError("Enter a valid wallet address");
    }

    const normalized = getAddress(wallet.trim()).toLowerCase();

    if (group.members.some((member) => member.wallet === normalized)) {
      return setError("That wallet is already in this group");
    }

    onCreate({
      wallet: normalized,
      name: name.trim() || short(normalized),
    });
  }

  return (
    <Modal
      title="Add member"
      subtitle="Add another Arc-compatible wallet."
      onClose={onClose}
    >
      <div className="form">
        <label>
          Name
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Alex"
          />
        </label>
        <label>
          Wallet address
          <input
            className="input walletInput"
            value={wallet}
            onChange={(event) => setWallet(event.target.value)}
            placeholder="0x…"
          />
        </label>

        {error && <div className="errorBox">{error}</div>}

        <button className="primary fullButton" onClick={submit}>
          <UserPlus size={16} /> Add Member
        </button>
      </div>
    </Modal>
  );
}

function ExpenseModal({
  group,
  wallet,
  onClose,
  onCreate,
}: {
  group: Group;
  wallet: string;
  onClose: () => void;
  onCreate: (expense: Expense) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(wallet);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  function submit() {
    if (!description.trim()) {
      return setError("Enter an expense description");
    }

    let total: bigint;

    try {
      total = parseUnits(amount.trim(), 6);
    } catch {
      return setError("Enter a valid USDC amount");
    }

    if (total <= 0n) return setError("Amount must be greater than zero");

    let parts: bigint[];

    if (splitType === "equal") {
      parts = equalSplit(total, group.members.length);
    } else {
      try {
        parts = group.members.map((member) =>
          parseUnits((custom[member.wallet] || "0").trim(), 6),
        );
      } catch {
        return setError("Enter valid custom split amounts");
      }

      const customTotal = parts.reduce((sum, value) => sum + value, 0n);

      if (customTotal !== total) {
        return setError(
          "Custom split must total exactly " +
            formatUnits(total, 6) +
            " USDC",
        );
      }
    }

    onCreate({
      id: uid(),
      description: description.trim().slice(0, 120),
      amount: formatUnits(total, 6),
      paidBy,
      splitType,
      createdAt: new Date().toISOString(),
      splits: group.members.map((member, index) => ({
        wallet: member.wallet,
        amount: formatUnits(parts[index], 6),
        status: member.wallet === paidBy ? "paid" : "pending",
        paymentId: uid(),
      })),
    });
  }

  return (
    <Modal
      title="Add expense"
      subtitle="Record the expense and choose how the group should split it."
      onClose={onClose}
      wide
    >
      <div className="form">
        <label>
          Expense
          <input
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Dinner"
          />
        </label>

        <div className="two">
          <label>
            Total USDC
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="120.00"
            />
          </label>
          <label>
            Paid by
            <select
              className="input"
              value={paidBy}
              onChange={(event) => setPaidBy(event.target.value)}
            >
              {group.members.map((member) => (
                <option value={member.wallet} key={member.wallet}>
                  {member.wallet === wallet ? "You" : member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="segmented">
          <button
            className={splitType === "equal" ? "segActive" : ""}
            onClick={() => setSplitType("equal")}
          >
            Equal Split
          </button>
          <button
            className={splitType === "custom" ? "segActive" : ""}
            onClick={() => setSplitType("custom")}
          >
            Custom Split
          </button>
        </div>

        {splitType === "custom" && (
          <div className="splitPreview">
            {group.members.map((member) => (
              <label key={member.wallet}>
                <span>{member.wallet === wallet ? "You" : member.name}</span>
                <input
                  className="miniInput"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={custom[member.wallet] || ""}
                  onChange={(event) =>
                    setCustom((value) => ({
                      ...value,
                      [member.wallet]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        )}

        {error && <div className="errorBox">{error}</div>}

        <button className="primary fullButton" onClick={submit}>
          <ReceiptText size={16} /> Save Expense
        </button>
      </div>
    </Modal>
  );
}

function HowModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="How SplitFlow works"
      subtitle="A simple path from shared expenses to optimized Arc settlement."
      onClose={onClose}
    >
      <div className="howSteps">
        <div><span>01</span><b>Create a group</b><p>Add the wallets sharing expenses.</p></div>
        <div><span>02</span><b>Record expenses</b><p>Use equal or custom USDC splits.</p></div>
        <div><span>03</span><b>Share requests</b><p>Copy, share or show a QR payment request.</p></div>
        <div><span>04</span><b>Optimize settlement</b><p>Reduce pending debts into fewer transfers.</p></div>
      </div>
    </Modal>
  );
}

function QrModal({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const image =
    "https://quickchart.io/qr?size=220&margin=2&text=" +
    encodeURIComponent(url);

  return (
    <Modal
      title="Payment request QR"
      subtitle="Scan to open this SplitFlow payment request."
      onClose={onClose}
    >
      <div className="qrWrap">
        <img src={image} alt="SplitFlow payment QR code" />
        <p>{url}</p>
        <button
          className="secondary fullButton"
          onClick={async () => {
            await safeCopy(url);
          }}
        >
          <Copy size={14} /> Copy payment link
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
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", keydown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", keydown);
    };
  }, [onClose]);

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div
        className={"modal surface " + (wide ? "wideModal" : "")}
        onMouseDown={(event) => event.stopPropagation()}
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
