import { NextRequest, NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import { getSql } from "../../../../../lib/db";
import { getSessionAddress } from "../../../../../lib/session";
import {
  buildNetBalances,
  optimizeSettlements,
  type AppliedTransfer,
  type Obligation,
} from "../../../../../lib/settlement";
import { isUuid, safeServerMessage } from "../../../../../lib/validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const recalculate = new URL(request.url).searchParams.get("recalculate") === "1";
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

    if (existing[0] && !recalculate) {
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

    if (existing[0] && recalculate) {
      await sql`
        UPDATE settlement_rounds
        SET status = 'cancelled'
        WHERE id = ${existing[0].id} AND status = 'open'
      `;
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

    const previouslyPaid = await sql`
      SELECT st.from_wallet, st.to_wallet, st.amount_usdc::text
      FROM settlement_transfers st
      JOIN settlement_rounds sr ON sr.id = st.round_id
      WHERE sr.group_id = ${id}
        AND sr.status = 'cancelled'
        AND st.status = 'paid'
      ORDER BY st.created_at
    `;

    const obligations: Obligation[] = pending.map((row) => ({
      debtor: String(row.debtor),
      creditor: String(row.creditor),
      units: parseUnits(String(row.amount_usdc), 6),
    }));

    const appliedTransfers: AppliedTransfer[] = previouslyPaid.map((row) => ({
      from: String(row.from_wallet),
      to: String(row.to_wallet),
      units: parseUnits(String(row.amount_usdc), 6),
    }));

    const balances = buildNetBalances(obligations, appliedTransfers);
    const optimized = optimizeSettlements(balances);

    if (!optimized.length) {
      await sql`
        UPDATE expense_splits
        SET status = 'paid'
        WHERE id IN (
          SELECT es.id
          FROM expense_splits es
          JOIN expenses e ON e.id = es.expense_id
          WHERE e.group_id = ${id} AND es.status = 'pending'
        )
      `;

      return NextResponse.json({
        completed: true,
        transfers: [],
        originalPaymentCount: pending.length,
        optimizedPaymentCount: 0,
        transactionsSaved: pending.length,
        recalculated: recalculate,
      });
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
      transactionsSaved: Math.max(0, pending.length - transfers.length),
      recalculated: recalculate,
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
      { error: "This settlement has started. Recalculate the remaining balance instead." },
      { status: 409 },
    );
  }

  await sql`DELETE FROM settlement_rounds WHERE id = ${rounds[0].id}`;
  return NextResponse.json({ ok: true });
}
