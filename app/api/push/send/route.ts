import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendPushToOthers } from "@/lib/push";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body, url } = await req.json();
  if (!title || !body) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  await sendPushToOthers(session.user.id, {
    title,
    body,
    url: url || "/dashboard",
  });

  return NextResponse.json({ success: true });
}
