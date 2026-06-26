import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendPushToOthers } from "@/lib/push";

// Only allow same-origin relative paths as the notification target so a
// notification can't be used to navigate the partner to an arbitrary site.
// Rejects absolute URLs, protocol-relative ("//evil.com") and "/\evil.com".
function safeRelativeUrl(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) {
    return "/dashboard";
  }
  return url.slice(0, 512);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body, url } = await req.json().catch(() => ({}));
  if (typeof title !== "string" || !title.trim() || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await sendPushToOthers(session.user.id, {
    title: title.trim().slice(0, 100),
    body: body.trim().slice(0, 300),
    url: safeRelativeUrl(url),
  });

  return NextResponse.json({ success: true });
}
