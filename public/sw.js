self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, url } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [200, 100, 200],
      data: { url: url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Prefer a tab already showing the target URL, else any tab of ours.
        const exact = clientList.find((c) => c.url === target);
        const client = exact || clientList.find((c) => c.url.startsWith(self.location.origin));
        if (client) {
          return client.focus().then((focused) => {
            if (exact) return focused;
            // navigate() rejects for uncontrolled clients — open a window instead.
            return focused.navigate(target).catch(() => clients.openWindow(target));
          });
        }
        return clients.openWindow(target);
      })
  );
});

// Push services rotate subscriptions occasionally — re-subscribe with the
// same VAPID key and tell the server, or notifications silently stop.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    Promise.resolve(
      event.newSubscription ||
        self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
        })
    ).then((subscription) =>
      fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      })
    )
  );
});
