"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  Plus,
  ReceiptText,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { formatUnits, getAddress, isAddress, parseUnits } from "viem";
import {
  buildNetBalances,
  optimizeSettlements,
  type Obligation,
} from "../lib/settlement";

type Member = { wallet: string; name: string };
type Split = { wallet: string; amount: string; status: "pending" | "paid" };
type Expense = {
  id: string;
  description: string;
  amount: string;
  paidBy: string;
  splits: Split[];
  createdAt: string;
};
type Group = {
  id: string;
  name: string;
  members: Member[];
  expenses: Expense[];
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
function key(wallet: string) {
  return "splitflow_local_v1_" + wallet.toLowerCase();
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

export default function LocalSplitFlow({ wallet }: { wallet: string }) {
  const current = wallet.toLowerCase();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showExpense, setShowExpense] = useState(false);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key(current)) || "[]") as Group[];
      const safeGroups = Array.isArray(parsed) ? parsed : [];
      setGroups(safeGroups);
      setSelectedId(safeGroups[0]?.id || null);
    } catch {
      setGroups([]);
      setSelectedId(null);
    }
  }, [current]);

  useEffect(() => {
    localStorage.setItem(key(current), JSON.stringify(groups));
  }, [groups, current]);

  const selected = useMemo(
    () => groups.find((group) => group.id === selectedId) || null,
    [groups, selectedId],
  );

  function saveGroup(group: Group) {
    setGroups((all) =>
      all.map((item) => (item.id === group.id ? group : item)),
    );
  }

  return (
    <section className="appLayout">
      <aside className="sidePanel">
        <div className="sideHeader">
          <div>
            <span className="sideLabel">Groups</span>
            <b>{groups.length}</b>
          </div>
          <button className="iconButton" onClick={() => setShowCreate(true)}>
            <Plus size={17} />
          </button>
        </div>

        <div className="localModeBanner">
          <span><i className="networkDot" /> Local safe mode</span>
          <small>Saved on this device</small>
        </div>

        {groups.length === 0 ? (
          <button
            className="emptyGroupButton"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={18} />
            <b>Create your first group</b>
            <span>Works while hosted storage is unavailable.</span>
          </button>
        ) : (
          <div className="groupList">
            {groups.map((group) => (
              <button
                key={group.id}
                className={
                  "groupButton " +
                  (selectedId === group.id ? "groupButtonActive" : "")
                }
                onClick={() => setSelectedId(group.id)}
              >
                <div className="groupInitial">
                  {group.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="groupButtonBody">
                  <b>{group.name}</b>
                  <span>{group.members.length} members</span>
                </div>
                <div className="doneBadge"><Check size={13} /></div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="workspace">
        {!selected ? (
          <div className="onboardingCard">
            <div className="eyebrow">Presentation-safe mode</div>
            <h2>Create a group and continue.</h2>
            <p className="muted">
              SplitFlow automatically switched to local persistence because the
              hosted database is unavailable. Your groups and expenses are saved
              in this browser.
            </p>
            <button className="primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create group
            </button>
          </div>
        ) : (
          <LocalGroup
            group={selected}
            wallet={current}
            onSave={saveGroup}
            onAddExpense={() => setShowExpense(true)}
            onDelete={() => {
              if (!window.confirm("Delete this group?")) return;
              const next = groups.filter((group) => group.id !== selected.id);
              setGroups(next);
              setSelectedId(next[0]?.id || null);
            }}
          />
        )}
      </section>

      {showCreate && (
        <CreateModal
          wallet={current}
          onClose={() => setShowCreate(false)}
          onCreate={(group) => {
            setGroups((all) => [group, ...all]);
            setSelectedId(group.id);
            setShowCreate(false);
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
            });
            setShowExpense(false);
          }}
        />
      )}
    </section>
  );
}

function LocalGroup({
  group,
  wallet,
  onSave: _onSave,
  onAddExpense,
  onDelete,
}: {
  group: Group;
  wallet: string;
  onSave: (group: Group) => void;
  onAddExpense: () => void;
  onDelete: () => void;
}) {
  const splits = group.expenses.flatMap((expense) => expense.splits);
  const pending = splits.filter((split) => split.status === "pending");
  const total = group.expenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0,
  );
  const pendingTotal = pending.reduce(
    (sum, split) => sum + Number(split.amount),
    0,
  );
  const progress = splits.length
    ? Math.round(((splits.length - pending.length) / splits.length) * 100)
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

  function exportCsv() {
    const rows = [
      ["Expense", "Amount USDC", "Paid by", "Created"],
      ...group.expenses.map((expense) => [
        expense.description,
        expense.amount,
        label(group, expense.paidBy, wallet),
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
  }

  return (
    <div className="workspaceStack">
      <section className="groupTop">
        <div>
          <div className="kicker">Group overview</div>
          <h1>{group.name}</h1>
          <div className="groupMeta">
            <span>{group.members.length} members</span>
            <span>·</span>
            <span>{group.expenses.length} expenses</span>
            <span>·</span>
            <span>{progress}% settled</span>
          </div>
        </div>
        <button className="primary" onClick={onAddExpense}>
          <Plus size={15} /> Add expense
        </button>
      </section>

      <section className="statGrid">
        <div className="statCard">
          <span>Group spend</span>
          <b>{money(total)}</b>
          <small>Recorded expenses</small>
        </div>
        <div className="statCard">
          <span>Pending</span>
          <b className="amber">{money(pendingTotal)}</b>
          <small>{pending.length} open shares</small>
        </div>
        <div className="statCard">
          <span>Members</span>
          <b>{group.members.length}</b>
          <small>Wallets in group</small>
        </div>
        <div className="statCard">
          <span>Mode</span>
          <b className="green">Local</b>
          <small>Saved on this device</small>
        </div>
      </section>

      <section className="surface progressSurface">
        <div className="progressHeader">
          <div>
            <span className="sectionEyebrow">Settlement progress</span>
            <b>{progress}% complete</b>
          </div>
          <span>
            {splits.length - pending.length} of {splits.length} shares paid
          </span>
        </div>
        <div className="progressTrack">
          <div
            className="progressFill"
            style={{ width: progress + "%" }}
          />
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
          {group.members.map((member) => (
            <div className="memberCard" key={member.wallet}>
              <div className="memberAvatar">
                {(member.name || short(member.wallet))
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="memberInfo">
                <b>{member.wallet === wallet ? "You" : member.name}</b>
                <span>{short(member.wallet)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface">
        <div className="sectionTitle settlementHeader">
          <div>
            <span className="sectionEyebrow">Smart settlement</span>
            <h2>
              {obligations.length
                ? obligations.length +
                  " debts → " +
                  plan.length +
                  " transfers"
                : "Nothing left to settle"}
            </h2>
            <p>Exact micro-USDC netting runs locally.</p>
          </div>
        </div>

        {plan.length > 0 && (
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

      <section className="surface">
        <div className="sectionTitle expenseHeader">
          <div>
            <span className="sectionEyebrow">Expenses</span>
            <h2>{group.expenses.length} recorded</h2>
          </div>
          <div className="toolbar">
            <button className="textButton" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
            <button className="primary" onClick={onAddExpense}>
              <Plus size={14} /> Add expense
            </button>
          </div>
        </div>

        {group.expenses.length === 0 ? (
          <div className="emptyState compact">
            <ReceiptText size={21} />
            <b>No expenses yet</b>
            <span>Add the first expense to start splitting.</span>
          </div>
        ) : (
          <div className="expenseList">
            {group.expenses.map((expense) => (
              <article className="expenseCard" key={expense.id}>
                <div className="expenseTop">
                  <div>
                    <div className="expenseTitleRow">
                      <b>{expense.description}</b>
                      <span className="statusPending">Pending</span>
                    </div>
                    <span>
                      Paid by {label(group, expense.paidBy, wallet)} · equal split
                    </span>
                  </div>
                  <div className="expenseAmount">{money(expense.amount)}</div>
                </div>
                <div className="splitRows">
                  {expense.splits.map((split) => (
                    <div className="splitRow" key={split.wallet}>
                      <div>
                        <b>{label(group, split.wallet, wallet)}</b>
                        <span>{money(split.amount)}</span>
                      </div>
                      <div className="splitActions">
                        <span
                          className={
                            split.status === "paid"
                              ? "statusPaid"
                              : "statusPending"
                          }
                        >
                          {split.status === "paid" ? "Paid" : "Pending"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="surface">
        <div className="inlineActions">
          <button className="secondary" onClick={exportCsv}>
            <Download size={14} /> Export CSV
          </button>
          <button className="secondary" onClick={onDelete}>
            <Trash2 size={14} /> Delete group
          </button>
        </div>
      </section>
    </div>
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
  const [memberName, setMemberName] = useState("");
  const [memberWallet, setMemberWallet] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!name.trim()) return setError("Enter a group name");
    if (!isAddress(memberWallet.trim())) {
      return setError("Enter a valid second wallet address");
    }
    const second = getAddress(memberWallet.trim()).toLowerCase();
    if (second === wallet) return setError("Add a different second wallet");

    onCreate({
      id: uid(),
      name: name.trim().slice(0, 80),
      members: [
        { wallet, name: "You" },
        {
          wallet: second,
          name: memberName.trim() || short(second),
        },
      ],
      expenses: [],
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <Modal
      title="Create group"
      subtitle="Saved locally while hosted storage is unavailable."
      onClose={onClose}
    >
      <div className="form">
        <label>
          Group name
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Trip to Goa"
          />
        </label>
        <label>
          Second member name
          <input
            className="input"
            value={memberName}
            onChange={(event) => setMemberName(event.target.value)}
            placeholder="Levi"
          />
        </label>
        <label>
          Second member wallet
          <input
            className="input walletInput"
            value={memberWallet}
            onChange={(event) => setMemberWallet(event.target.value)}
            placeholder="0x…"
          />
        </label>
        {error && <div className="errorBox">{error}</div>}
        <button className="primary fullButton" onClick={submit}>
          <Users size={16} /> Create group
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

    const parts = equalSplit(total, group.members.length);

    onCreate({
      id: uid(),
      description: description.trim().slice(0, 120),
      amount: formatUnits(total, 6),
      paidBy,
      createdAt: new Date().toISOString(),
      splits: group.members.map((member, index) => ({
        wallet: member.wallet,
        amount: formatUnits(parts[index], 6),
        status: member.wallet === paidBy ? "paid" : "pending",
      })),
    });
  }

  return (
    <Modal
      title="Add expense"
      subtitle="Equal split · exact micro-USDC arithmetic"
      onClose={onClose}
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
        {error && <div className="errorBox">{error}</div>}
        <button className="primary fullButton" onClick={submit}>
          <ReceiptText size={16} /> Save expense
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div
        className="modal surface"
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
