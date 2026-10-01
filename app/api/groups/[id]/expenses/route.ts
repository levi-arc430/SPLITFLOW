import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress, parseUnits } from "viem";
import { getSql } from "../../../../../lib/db";
import { getSessionAddress } from "../../../../../lib/session";
import { isUuid, safeServerMessage } from "../../../../../lib/validation";

function unitsToUsdc(units: bigint) {
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0");
  return whole.toString() + "." + fraction;
}

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

    const body = (await request.json()) as {
      description?: string;
      amount?: string;
      paidBy?: string;
      splitType?: "equal" | "custom";
      customSplits?: Array<{ wallet: string; amount: string }>;
    };

    const description = body.description?.trim();
    if (!description || description.length > 120) {
      return NextResponse.json({ error: "Enter an expense description" }, { status: 400 });
    }

    const amountRaw = body.amount?.trim() || "";
    let totalUnits: bigint;
    try {
      totalUnits = parseUnits(amountRaw, 6);
    } catch {
      return NextResponse.json({ error: "Invalid USDC amount" }, { status: 400 });
    }
    if (totalUnits <= 0n) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    const sql = await getSql();
    const membership = await sql`
      SELECT wallet_address, display_name
      FROM group_members
      WHERE group_id = ${id}
      ORDER BY created_at
    `;

    if (!membership.some((m) => String(m.wallet_address).toLowerCase() === wallet)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const activeRound = await sql`
      SELECT 1 FROM settlement_rounds
      WHERE group_id = ${id} AND status = 'open'
      LIMIT 1
    `;
    if (activeRound[0]) {
      return NextResponse.json(
        { error: "Finish or cancel the active Smart Settlement before adding a new expense" },
        { status: 409 },
      );
    }

    const payerRaw = body.paidBy || wallet;
    if (!isAddress(payerRaw)) {
      return NextResponse.json({ error: "Invalid payer wallet" }, { status: 400 });
    }
    const paidBy = getAddress(payerRaw).toLowerCase();
    if (!membership.some((m) => String(m.wallet_address).toLowerCase() === paidBy)) {
      return NextResponse.json({ error: "Payer must be a group member" }, { status: 400 });
    }

    const splitType = body.splitType === "custom" ? "custom" : "equal";
    const splitRows: Array<{ wallet: string; units: bigint }> = [];

    if (splitType === "equal") {
      const count = BigInt(membership.length);
      const base = totalUnits / count;
      let remainder = totalUnits % count;

      for (const member of membership) {
        let units = base;
        if (remainder > 0n) {
          units += 1n;
          remainder -= 1n;
        }
        splitRows.push({
          wallet: String(member.wallet_address).toLowerCase(),
          units,
        });
      }
    } else {
      const custom = body.customSplits || [];
      const seen = new Set<string>();
      let sum = 0n;

      for (const item of custom) {
        if (!isAddress(item.wallet)) {
          return NextResponse.json({ error: "Invalid custom split wallet" }, { status: 400 });
        }
        const memberWallet = getAddress(item.wallet).toLowerCase();
        if (seen.has(memberWallet)) {
          return NextResponse.json({ error: "Duplicate custom split member" }, { status: 400 });
        }
        if (!membership.some((m) => String(m.wallet_address).toLowerCase() === memberWallet)) {
          return NextResponse.json({ error: "Custom split wallet is not in the group" }, { status: 400 });
        }

        let units: bigint;
        try {
          units = parseUnits(item.amount, 6);
        } catch {
          return NextResponse.json({ error: "Invalid custom split amount" }, { status: 400 });
        }
        if (units < 0n) {
          return NextResponse.json({ error: "Split amounts cannot be negative" }, { status: 400 });
        }

        seen.add(memberWallet);
        sum += units;
        splitRows.push({ wallet: memberWallet, units });
      }

      if (splitRows.length !== membership.length) {
        return NextResponse.json(
          { error: "Custom split must include every group member" },
          { status: 400 },
        );
      }
      if (sum !== totalUnits) {
        return NextResponse.json(
          { error: "Custom split must add up exactly to the expense total" },
          { status: 400 },
        );
      }
    }

    const [expense] = await sql`
      INSERT INTO expenses (
        group_id, description, amount_usdc, paid_by, split_type, created_by
      )
      VALUES (
        ${id}, ${description}, ${unitsToUsdc(totalUnits)}, ${paidBy},
        ${splitType}, ${wallet}
      )
      RETURNING id, group_id, description, amount_usdc::text, paid_by,
                split_type, created_by, created_at
    `;

    const splits = [];
    for (const split of splitRows) {
      const status = split.wallet === paidBy || split.units === 0n ? "paid" : "pending";
      const [created] = await sql`
        INSERT INTO expense_splits (
          expense_id, wallet_address, amount_usdc, status
        )
        VALUES (
          ${expense.id}, ${split.wallet}, ${unitsToUsdc(split.units)}, ${status}
        )
        RETURNING id, expense_id, wallet_address, amount_usdc::text,
                  status, payment_token
      `;
      splits.push(created);
    }

    return NextResponse.json({ expense, splits }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: safeServerMessage(error, "Unable to create expense") },
      { status: 500 },
    );
  }
}
