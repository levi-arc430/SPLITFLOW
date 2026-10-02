import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getSql } from "../../../../../lib/db";
import { getSessionAddress } from "../../../../../lib/session";
import { isUuid, safeServerMessage } from "../../../../../lib/validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const sessionWallet = await getSessionAddress();
  if (!sessionWallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      wallet?: string;
      name?: string;
    };

    const rawWallet = body.wallet?.trim() || "";
    if (!isAddress(rawWallet)) {
      return NextResponse.json({ error: "Enter a valid wallet address" }, { status: 400 });
    }

    const wallet = getAddress(rawWallet).toLowerCase();
    const name = body.name?.trim().slice(0, 60) || null;
    const sql = await getSql();

    const membership = await sql`
      SELECT role
      FROM group_members
      WHERE group_id = ${id} AND wallet_address = ${sessionWallet}
      LIMIT 1
    `;

    if (!membership[0]) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (membership[0].role !== "owner" && membership[0].role !== "admin") {
      return NextResponse.json(
        { error: "Only a group owner or admin can add members" },
        { status: 403 },
      );
    }

    const activeRound = await sql`
      SELECT 1
      FROM settlement_rounds
      WHERE group_id = ${id} AND status = 'open'
      LIMIT 1
    `;

    if (activeRound[0]) {
      return NextResponse.json(
        { error: "Finish or cancel the active settlement before adding members" },
        { status: 409 },
      );
    }

    const count = await sql`
      SELECT count(*)::int AS count
      FROM group_members
      WHERE group_id = ${id}
    `;

    const alreadyExists = await sql`
      SELECT id
      FROM group_members
      WHERE group_id = ${id} AND wallet_address = ${wallet}
      LIMIT 1
    `;

    if (!alreadyExists[0] && Number(count[0]?.count || 0) >= 50) {
      return NextResponse.json(
        { error: "A group can have at most 50 members in this MVP" },
        { status: 400 },
      );
    }

    const [member] = await sql`
      INSERT INTO group_members (group_id, wallet_address, display_name, role)
      VALUES (${id}, ${wallet}, ${name}, 'member')
      ON CONFLICT (group_id, wallet_address)
      DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, group_members.display_name)
      RETURNING id, wallet_address, display_name, role, created_at
    `;

    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: safeServerMessage(error, "Unable to add member") },
      { status: 500 },
    );
  }
}
