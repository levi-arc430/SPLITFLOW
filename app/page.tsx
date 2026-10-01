"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Clock3, Plus, ReceiptText, Send, Users } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { optimizeSettlements } from "../lib/settlement";

const members = [
  { name: "You", wallet: "0x71F...A28", owes: 30, paid: true },
  { name: "Alex", wallet: "0xA19...C42", owes: 30, paid: false },
  { name: "Sam", wallet: "0x922...19D", owes: 30, paid: true },
  { name: "Ryan", wallet: "0x8C1...841", owes: 30, paid: false },
];

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [expenseName, setExpenseName] = useState("");
  const [amount, setAmount] = useState("120");

  const settlements = useMemo(
    () =>
      optimizeSettlements([
        { member: "You", amount: 60 },
        { member: "Alex", amount: -20 },
        { member: "Ryan", amount: -40 },
      ]),
    []
  );

  const walletLabel = isConnected && address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "Connect wallet";

  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><div className="logo">S</div>SplitFlow</div>
        <button
          className="wallet"
          onClick={() =>
            isConnected
              ? disconnect()
              : connectors[0] && connect({ connector: connectors[0] })
          }
        >
          {walletLabel}
        </button>
      </nav>

      <section className="hero">
        <div className="card">
          <div className="eyebrow">Your position</div>
          <div className="balance">
            $45.00 <span className="muted" style={{ fontSize: 18 }}>USDC</span>
          </div>
          <div className="muted">Outstanding across 2 groups on Arc.</div>
          <div className="actions">
            <button className="primary"><Send size={16} /> Settle balances</button>
            <button className="secondary"><Plus size={16} /> New group</button>
          </div>
        </div>

        <div className="card">
          <div className="eyebrow">Net owed to you</div>
          <div className="metric green">$82.50</div>
          <div className="muted" style={{ marginTop: 8 }}>USDC expected from 4 members.</div>
          <div className="pill">Arc Testnet • 5042002</div>
        </div>
      </section>

      <section className="grid">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="sectionTitle">
              <h2>Groups</h2>
              <span className="muted">3 active</span>
            </div>

            <div className="group">
              <div>
                <div className="groupName">🏖️ Trip to Goa</div>
                <div className="pill">4 members • 2 pending</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="amount">$60</div>
                <div className="amber">pending</div>
              </div>
            </div>

            <div className="group">
              <div>
                <div className="groupName">🏠 Apartment</div>
                <div className="pill">3 members</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="amount">$0</div>
                <div className="green">settled</div>
              </div>
            </div>

            <div className="group">
              <div>
                <div className="groupName">🍕 Friday Dinner</div>
                <div className="pill">5 members • 1 pending</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="amount">$15</div>
                <div className="amber">pending</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="sectionTitle">
              <h2>Trip to Goa</h2>
              <span className="muted">$120 USDC</span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Person</th><th>Owes</th><th>Status</th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.name}>
                    <td>
                      <b>{m.name}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{m.wallet}</div>
                    </td>
                    <td>{"$" + m.owes}</td>
                    <td>
                      {m.paid
                        ? <span className="green">✓ Paid</span>
                        : <span className="amber">⏳ Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="sectionTitle">
              <h2>Smart Settlement</h2>
              <span className="pill">optimized</span>
            </div>
            <p className="muted">
              SplitFlow nets the whole group first, reducing unnecessary transfers.
            </p>

            {settlements.map((s) => (
              <div className="settle" key={s.from + "-" + s.to}>
                <div className="settleRow">
                  <div>
                    <b>{s.from}</b> <ArrowRight className="arrow" size={14} /> <b>{s.to}</b>
                  </div>
                  <div className="amount">{"$" + s.amount}</div>
                </div>
              </div>
            ))}

            <button className="primary" style={{ width: "100%" }}>
              Settle optimized balance
            </button>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="sectionTitle">
              <h2>Create expense</h2>
              <ReceiptText size={18} />
            </div>
            <div className="form">
              <input
                className="input"
                placeholder="Expense name"
                value={expenseName}
                onChange={(e) => setExpenseName(e.target.value)}
              />
              <div className="two">
                <input
                  className="input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <select className="input">
                  <option>Equal split</option>
                  <option>Custom split</option>
                </select>
              </div>
              <button className="secondary">Create payment requests</button>
            </div>
          </div>

          <div className="card">
            <div className="sectionTitle">
              <h2>Recent activity</h2>
              <Clock3 size={18} />
            </div>

            <div className="activity">
              <div className="icon"><Check size={16} /></div>
              <div className="activityMain">
                <div className="activityTitle">Sam paid you</div>
                <div className="activityMeta">Goa Trip • Arc</div>
              </div>
              <b className="green">+$30</b>
            </div>

            <div className="activity">
              <div className="icon"><Send size={16} /></div>
              <div className="activityMain">
                <div className="activityTitle">You paid Alex</div>
                <div className="activityMeta">Apartment • Arc</div>
              </div>
              <b>-$20</b>
            </div>

            <div className="activity">
              <div className="icon"><Users size={16} /></div>
              <div className="activityMain">
                <div className="activityTitle">Ryan payment pending</div>
                <div className="activityMeta">Goa Trip</div>
              </div>
              <b className="amber">$30</b>
            </div>
          </div>
        </div>
      </section>

      <div className="footer">
        SplitFlow • Group payments and smart USDC settlement on Arc
      </div>
    </main>
  );
}
