import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";
import { getSessionAddress } from "../../../../lib/session";
import { isUuid, safeServerMessage } from "../../../../lib/validation";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const sql = await getSql();

    const rows = await sql`
      SELECT e.id, e.group_id, e.paid_by, e.created_by, gm.role
      FROM expenses e
      JOIN group_members gm
        ON gm.group_id = e.group_id AND gm.wallet_address = ${wallet}
      WHERE e.id = ${id}
      LIMIT 1
    `;

    const expense = rows[0];
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const canDelete =
      String(expense.created_by).toLowerCase() === wallet ||
      expense.role === "owner" ||
      expense.role === "admin";

    if (!canDelete) {
      return NextResponse.json({ error: "You cannot delete this expense" }, { status: 403 });
    }

    const activeRound = await sql`
      SELECT 1
      FROM settlement_rounds
      WHERE group_id = ${expense.group_id} AND status = 'open'
      LIMIT 1
    `;
    if (activeRound[0]) {
      return NextResponse.json(
        { error: "Finish or cancel the active settlement before deleting an expense" },
        { status: 409 },
      );
    }

    const paidOthers = await sql`
      SELECT count(*)::int AS count
      FROM expense_splits
      WHERE expense_id = ${id}
        AND wallet_address <> ${String(expense.paid_by).toLowerCase()}
        AND status = 'paid'
    `;

    if (Number(paidOthers[0]?.count || 0) > 0) {
      return NextResponse.json(
        { error: "An expense with completed payments cannot be deleted" },
        { status: 409 },
      );
    }

    await sql`DELETE FROM expenses WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: safeServerMessage(error, "Unable to delete expense") },
      { status: 500 },
    );
  }
}
