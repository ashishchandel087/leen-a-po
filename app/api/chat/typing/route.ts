import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { publishTyping } from "@/lib/chat-bus";

// POST — broadcast a typing indicator. Pure pass-through: nothing is persisted.
// Body: { isTyping: boolean }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { isTyping } = (await req.json().catch(() => ({}))) as { isTyping?: boolean };
  if (typeof isTyping !== "boolean") {
    return NextResponse.json({ error: "isTyping required" }, { status: 400 });
  }

  publishTyping({
    userId: session.user.id,
    userName: session.user.name ?? "",
    isTyping,
  });
  return NextResponse.json({ ok: true });
}
