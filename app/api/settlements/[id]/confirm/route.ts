import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../../../lib/db";
import { getSessionAddress } from "../../../../../lib/session";
import { verifyUsdcTransfer } from "../../../../../lib/verify-transfer";
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
      return NextResponse.json({ error: "Settlement transfer not found" }, { status: 404 });
    }
    const body = (await request.json()) as { txHash?: string };
    if (!body.txHash) {
      return NextResponse.json({ error: "Transaction hash is required" }, { status: 400 });
    }

    const sql = await getSql();
    const rows = await sql`
      SELECT st.id, st.round_id, st.from_wallet, st.to_wallet,
             st.amount_usdc::text, st.status, st.tx_hash, sr.group_id
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

    const confirmedHash =
      transfer.status === "paid" ? transfer.tx_hash : body.txHash;

    if (transfer.status !== "paid") {
      await verifyUsdcTransfer({
        txHash: body.txHash,
        from: String(transfer.from_wallet),
        to: String(transfer.to_wallet),
        amount: String(transfer.amount_usdc),
      });

      const inserted = await sql`
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
        ON CONFLICT (tx_hash) DO NOTHING
        RETURNING id
      `;

      if (!inserted[0]) {
        const existingTx = await sql`
          SELECT payment_token, settlement_transfer_id
          FROM transactions
          WHERE tx_hash = ${body.txHash}
          LIMIT 1
        `;

        if (
          !existingTx[0] ||
          String(existingTx[0].settlement_transfer_id || "") !== String(id)
        ) {
          return NextResponse.json(
            { error: "This Arc transaction was already used for another SplitFlow payment" },
            { status: 409 },
          );
        }
      }

      await sql`
        UPDATE settlement_transfers
        SET status = 'paid', tx_hash = ${body.txHash}
        WHERE id = ${id}
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
      txHash: confirmedHash || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeServerMessage(error, "Unable to verify settlement") },
      { status: 400 },
    );
  }
}
