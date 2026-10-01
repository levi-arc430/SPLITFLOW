import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../../../lib/db";
import { verifyUsdcTransfer } from "../../../../../lib/verify-transfer";
import { isUuid, safeServerMessage } from "../../../../../lib/validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    if (!isUuid(token)) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    const body = (await request.json()) as { txHash?: string };
    if (!body.txHash) {
      return NextResponse.json({ error: "Transaction hash is required" }, { status: 400 });
    }

    const sql = await getSql();
    const rows = await sql`
      SELECT es.id AS split_id, es.payment_token, es.wallet_address AS debtor,
             es.amount_usdc::text, es.status, es.settled_tx_hash, e.id AS expense_id,
             e.group_id, e.paid_by AS recipient,
             EXISTS (
               SELECT 1
               FROM settlement_round_splits srs
               JOIN settlement_rounds sr ON sr.id = srs.round_id
               WHERE srs.split_id = es.id AND sr.status = 'open'
             ) AS locked_by_settlement
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE es.payment_token = ${token}
      LIMIT 1
    `;

    const payment = rows[0];
    if (!payment) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }

    if (payment.status === "paid") {
      return NextResponse.json({
        status: "paid",
        txHash: payment.settled_tx_hash || null,
      });
    }

    if (payment.locked_by_settlement) {
      return NextResponse.json(
        { error: "This request is part of an active Smart Settlement plan" },
        { status: 409 },
      );
    }

    await verifyUsdcTransfer({
      txHash: body.txHash,
      from: String(payment.debtor),
      to: String(payment.recipient),
      amount: String(payment.amount_usdc),
    });

    await sql`
      UPDATE expense_splits
      SET status = 'paid', settled_tx_hash = ${body.txHash}
      WHERE id = ${payment.split_id}
    `;

    await sql`
      INSERT INTO transactions (
        group_id, expense_id, payment_token, from_wallet, to_wallet,
        amount_usdc, tx_hash, status
      )
      VALUES (
        ${payment.group_id}, ${payment.expense_id}, ${payment.payment_token},
        ${String(payment.debtor).toLowerCase()},
        ${String(payment.recipient).toLowerCase()},
        ${payment.amount_usdc}, ${body.txHash}, 'confirmed'
      )
      ON CONFLICT (tx_hash) DO UPDATE SET status = 'confirmed'
    `;

    return NextResponse.json({ status: "paid", txHash: body.txHash });
  } catch (error) {
    return NextResponse.json(
      { error: safeServerMessage(error, "Unable to verify payment") },
      { status: 400 },
    );
  }
}
