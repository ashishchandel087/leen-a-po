import webpush from "web-push";
import { prisma } from "./prisma";

function init() {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

// 404/410 mean the subscription no longer exists at the push service — drop
// the row. Anything else (5xx, network, payload too large) is transient or
// our fault, so keep the subscription and just log. The delete promise is
// returned so Promise.allSettled actually waits for it — serverless can
// freeze the process before a fire-and-forget write lands.
function handleSendError(err: unknown, subId: string) {
  const statusCode = (err as { statusCode?: number })?.statusCode;
  if (statusCode === 404 || statusCode === 410) {
    return prisma.pushSubscription.delete({ where: { id: subId } }).catch(() => {});
  }
  console.warn("[push] send failed:", err instanceof Error ? err.message : err);
}

export async function sendPushToOthers(
  senderUserId: string,
  payload: { title: string; body: string; url?: string }
) {
  init();
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { not: senderUserId } },
  });
  if (!subs.length) return;

  await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
        .catch((err) => handleSendError(err, sub.id))
    )
  );
}

export async function sendPushToAll(
  payload: { title: string; body: string; url?: string }
) {
  init();
  const subs = await prisma.pushSubscription.findMany();
  if (!subs.length) return;

  await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
        .catch((err) => handleSendError(err, sub.id))
    )
  );
}
