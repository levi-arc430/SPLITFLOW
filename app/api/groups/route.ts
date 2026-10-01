import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getSql } from "../../../lib/db";
import { getSessionAddress } from "../../../lib/session";

export async function GET() {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = await getSql();
  const groups = await sql`
    SELECT DISTINCT g.id, g.name, g.created_by, g.created_at,
      (SELECT count(*)::int FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count,
      (SELECT count(*)::int
       FROM expenses e
       JOIN expense_splits es ON es.expense_id = e.id
       WHERE e.group_id = g.id AND es.status = 'pending') AS pending_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.wallet_address = ${wallet}
    ORDER BY g.created_at DESC
  `;

  return NextResponse.json({ groups });
}

export async function POST(request: NextRequest) {
  const wallet = await getSessionAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      name?: string;
      members?: Array<{ wallet?: string; name?: string }>;
    };
    const name = body.name?.trim();
    if (!name || name.length > 80) {
      return NextResponse.json({ error: "Enter a group name" }, { status: 400 });
    }

    const incoming = body.members || [];
    const memberMap = new Map<string, { wallet: string; name: string | null }>();
    memberMap.set(wallet, { wallet, name: "You" });

    for (const member of incoming) {
      const raw = member.wallet?.trim() || "";
      if (!isAddress(raw)) {
        return NextResponse.json({ error: "Invalid member wallet: " + raw }, { status: 400 });
      }
      const normalized = getAddress(raw).toLowerCase();
      memberMap.set(normalized, {
        wallet: normalized,
        name: member.name?.trim().slice(0, 60) || null,
      });
    }

    if (memberMap.size < 2) {
      return NextResponse.json(
        { error: "A group needs at least two wallet members" },
        { status: 400 },
      );
    }

    const sql = await getSql();
    const [group] = await sql`
      INSERT INTO groups (name, created_by)
      VALUES (${name}, ${wallet})
      RETURNING id, name, created_by, created_at
    `;

    for (const member of memberMap.values()) {
      await sql`
        INSERT INTO group_members (group_id, wallet_address, display_name)
        VALUES (${group.id}, ${member.wallet}, ${member.name})
        ON CONFLICT (group_id, wallet_address) DO NOTHING
      `;
    }

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create group" },
      { status: 500 },
    );
  }
}
