import { NextResponse } from "next/server";
import { getSessionAddress } from "../../../../lib/session";

export async function GET() {
  const address = await getSessionAddress();
  return NextResponse.json({ address });
}
