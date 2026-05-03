import webpush from "web-push";
import { prisma } from "./prisma";

function init() {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
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
        .catch(() => {
          prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        })
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
        .catch(() => {
          prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        })
    )
  );
}
