import { NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import { getSql } from "../../../../../lib/db";
import { getSessionAddress } from "../../../../../lib/session";
import { optimizeSettlements } from "../../../../../lib/settlement";
import { isUuid, safeServerMessage } from "../../../../../lib/validation";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const sql = await getSql();

    const membership = await sql`
      SELECT 1 FROM group_members
      WHERE group_id = ${id} AND wallet_address = ${wallet}
      LIMIT 1
    `;
    if (!membership[0]) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const existing = await sql`
      SELECT id, status, created_at
      FROM settlement_rounds
      WHERE group_id = ${id} AND status = 'open'
      ORDER BY created_at DESC LIMIT 1
    `;

    if (existing[0]) {
      const transfers = await sql`
        SELECT id, round_id, from_wallet, to_wallet, amount_usdc::text,
               status, tx_hash
        FROM settlement_transfers
        WHERE round_id = ${existing[0].id}
        ORDER BY created_at
      `;
      return NextResponse.json({
        round: existing[0],
        transfers,
        reused: true,
      });
    }

    const pending = await sql`
      SELECT es.id AS split_id, es.wallet_address AS debtor,
             es.amount_usdc::text, e.paid_by AS creditor
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = ${id}
        AND es.status = 'pending'
        AND es.amount_usdc > 0
      ORDER BY es.created_at
    `;

    if (!pending.length) {
      return NextResponse.json({ error: "This group is already settled" }, { status: 400 });
    }

    const balanceMap = new Map<string, bigint>();
    for (const row of pending) {
      const debtor = String(row.debtor).toLowerCase();
      const creditor = String(row.creditor).toLowerCase();
      const units = parseUnits(String(row.amount_usdc), 6);

      balanceMap.set(debtor, (balanceMap.get(debtor) || 0n) - units);
      balanceMap.set(creditor, (balanceMap.get(creditor) || 0n) + units);
    }

    const optimized = optimizeSettlements(
      [...balanceMap.entries()].map(([member, units]) => ({ member, units })),
    );

    if (!optimized.length) {
      return NextResponse.json({ error: "No settlement transfers are required" }, { status: 400 });
    }

    const [round] = await sql`
      INSERT INTO settlement_rounds (group_id, created_by)
      VALUES (${id}, ${wallet})
      RETURNING id, group_id, status, created_by, created_at
    `;

    for (const row of pending) {
      await sql`
        INSERT INTO settlement_round_splits (round_id, split_id)
        VALUES (${round.id}, ${row.split_id})
        ON CONFLICT DO NOTHING
      `;
    }

    const transfers = [];
    for (const transfer of optimized) {
      const [created] = await sql`
        INSERT INTO settlement_transfers (
          round_id, from_wallet, to_wallet, amount_usdc
        )
        VALUES (
          ${round.id}, ${transfer.from.toLowerCase()},
          ${transfer.to.toLowerCase()}, ${formatUnits(transfer.units, 6)}
        )
        RETURNING id, round_id, from_wallet, to_wallet,
                  amount_usdc::text, status, tx_hash
      `;
      transfers.push(created);
    }

    return NextResponse.json({
      round,
      transfers,
      originalPaymentCount: pending.length,
      optimizedPaymentCount: transfers.length,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: safeServerMessage(error, "Unable to create settlement plan") },
      { status: 500 },
    );
  }
}


export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const sql = await getSql();

  const membership = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${id} AND wallet_address = ${wallet}
    LIMIT 1
  `;
  if (!membership[0]) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const rounds = await sql`
    SELECT id FROM settlement_rounds
    WHERE group_id = ${id} AND status = 'open'
    ORDER BY created_at DESC LIMIT 1
  `;
  if (!rounds[0]) {
    return NextResponse.json({ ok: true });
  }

  const paid = await sql`
    SELECT count(*)::int AS count
    FROM settlement_transfers
    WHERE round_id = ${rounds[0].id} AND status = 'paid'
  `;
  if (Number(paid[0]?.count || 0) > 0) {
    return NextResponse.json(
      { error: "A started settlement plan cannot be cancelled" },
      { status: 409 },
    );
  }

  await sql`DELETE FROM settlement_rounds WHERE id = ${rounds[0].id}`;
  return NextResponse.json({ ok: true });
}
