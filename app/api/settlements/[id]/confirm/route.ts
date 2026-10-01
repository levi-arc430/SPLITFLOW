import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../../../lib/db";
import { getSessionAddress } from "../../../../../lib/session";
import { verifyUsdcTransfer } from "../../../../../lib/verify-transfer";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { txHash?: string };
    if (!body.txHash) {
      return NextResponse.json({ error: "Transaction hash is required" }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT st.id, st.round_id, st.from_wallet, st.to_wallet,
             st.amount_usdc::text, st.status, sr.group_id
      FROM settlement_transfers st
      JOIN settlement_rounds sr ON sr.id = st.round_id
      WHERE st.id = ${id}
      LIMIT 1
    `;

    const transfer = rows[0];
    if (!transfer) {
      return NextResponse.json({ error: "Settlement transfer not found" }, { status: 404 });
    }
    if (String(transfer.from_wallet).toLowerCase() !== wallet) {
      return NextResponse.json({ error: "This transfer belongs to another wallet" }, { status: 403 });
    }

    if (transfer.status !== "paid") {
      await verifyUsdcTransfer({
        txHash: body.txHash,
        from: String(transfer.from_wallet),
        to: String(transfer.to_wallet),
        amount: String(transfer.amount_usdc),
      });

      await sql`
        UPDATE settlement_transfers
        SET status = 'paid', tx_hash = ${body.txHash}
        WHERE id = ${id}
      `;

      await sql`
        INSERT INTO transactions (
          group_id, settlement_transfer_id, from_wallet, to_wallet,
          amount_usdc, tx_hash, status
        )
        VALUES (
          ${transfer.group_id}, ${id},
          ${String(transfer.from_wallet).toLowerCase()},
          ${String(transfer.to_wallet).toLowerCase()},
          ${transfer.amount_usdc}, ${body.txHash}, 'confirmed'
        )
        ON CONFLICT (tx_hash) DO UPDATE SET status = 'confirmed'
      `;
    }

    const remaining = await sql`
      SELECT count(*)::int AS count
      FROM settlement_transfers
      WHERE round_id = ${transfer.round_id} AND status = 'pending'
    `;

    let roundStatus = "open";
    if (Number(remaining[0]?.count || 0) === 0) {
      roundStatus = "completed";
      await sql`
        UPDATE settlement_rounds
        SET status = 'completed', completed_at = now()
        WHERE id = ${transfer.round_id}
      `;

      await sql`
        UPDATE expense_splits
        SET status = 'paid', settlement_round_id = ${transfer.round_id}
        WHERE id IN (
          SELECT split_id
          FROM settlement_round_splits
          WHERE round_id = ${transfer.round_id}
        )
      `;
    }

    return NextResponse.json({
      status: "paid",
      roundStatus,
      txHash: body.txHash,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify settlement" },
      { status: 400 },
    );
  }
}
