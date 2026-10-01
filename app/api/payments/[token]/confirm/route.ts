import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../../../lib/db";
import { verifyUsdcTransfer } from "../../../../../lib/verify-transfer";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const body = (await request.json()) as { txHash?: string };
    if (!body.txHash) {
      return NextResponse.json({ error: "Transaction hash is required" }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT es.id AS split_id, es.payment_token, es.wallet_address AS debtor,
             es.amount_usdc::text, es.status, e.id AS expense_id,
             e.group_id, e.paid_by AS recipient
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
      return NextResponse.json({ status: "paid", txHash: body.txHash });
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
      { error: error instanceof Error ? error.message : "Unable to verify payment" },
      { status: 400 },
    );
  }
}
