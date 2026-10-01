import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";
import { isUuid } from "../../../../lib/validation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!isUuid(token)) {
    return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  }
  const sql = await getSql();

  const rows = await sql`
    SELECT es.payment_token, es.wallet_address AS debtor,
           es.amount_usdc::text, es.status, es.settled_tx_hash,
           e.id AS expense_id, e.description, e.paid_by AS recipient,
           e.group_id, g.name AS group_name,
           EXISTS (
             SELECT 1
             FROM settlement_round_splits srs
             JOIN settlement_rounds sr ON sr.id = srs.round_id
             WHERE srs.split_id = es.id AND sr.status = 'open'
           ) AS locked_by_settlement
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
