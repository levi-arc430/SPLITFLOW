import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";
import { getSessionAddress } from "../../../../lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const sql = await getSql();

  const membership = await sql`
    SELECT g.id, g.name, g.created_by, g.created_at
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE g.id = ${id} AND gm.wallet_address = ${wallet}
    LIMIT 1
  `;

  if (!membership[0]) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const [members, expenses, splits, transactions, rounds, transfers] = await Promise.all([
    sql`
      SELECT id, wallet_address, display_name, created_at
      FROM group_members WHERE group_id = ${id}
      ORDER BY created_at
    `,
    sql`
      SELECT id, description, amount_usdc::text, paid_by, split_type, created_by, created_at
      FROM expenses WHERE group_id = ${id}
      ORDER BY created_at DESC
    `,
    sql`
      SELECT es.id, es.expense_id, es.wallet_address, es.amount_usdc::text,
             es.status, es.payment_token, es.settled_tx_hash
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = ${id}
      ORDER BY es.created_at
    `,
    sql`
      SELECT id, expense_id, payment_token, settlement_transfer_id, from_wallet,
             to_wallet, amount_usdc::text, tx_hash, status, created_at
      FROM transactions WHERE group_id = ${id}
      ORDER BY created_at DESC LIMIT 100
    `,
    sql`
      SELECT id, status, created_by, created_at, completed_at
      FROM settlement_rounds WHERE group_id = ${id}
      ORDER BY created_at DESC LIMIT 5
    `,
    sql`
      SELECT st.id, st.round_id, st.from_wallet, st.to_wallet,
             st.amount_usdc::text, st.status, st.tx_hash
      FROM settlement_transfers st
      JOIN settlement_rounds sr ON sr.id = st.round_id
      WHERE sr.group_id = ${id}
      ORDER BY st.created_at
    `,
  ]);

  return NextResponse.json({
    group: membership[0],
    members,
    expenses,
    splits,
    transactions,
    settlementRounds: rounds,
    settlementTransfers: transfers,
  });
}
