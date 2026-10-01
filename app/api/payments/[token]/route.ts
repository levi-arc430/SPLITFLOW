import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const sql = getSql();

  const rows = await sql`
    SELECT es.payment_token, es.wallet_address AS debtor,
           es.amount_usdc::text, es.status, es.settled_tx_hash,
           e.id AS expense_id, e.description, e.paid_by AS recipient,
           e.group_id, g.name AS group_name
    FROM expense_splits es
    JOIN expenses e ON e.id = es.expense_id
    JOIN groups g ON g.id = e.group_id
    WHERE es.payment_token = ${token}
    LIMIT 1
  `;

  if (!rows[0]) {
    return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  }

  return NextResponse.json({ payment: rows[0] });
}
