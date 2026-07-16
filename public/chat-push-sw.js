self.addEventListener("push", (event) => {
  let payload = { title: "Nauči AI", body: "Nova aktivnost", url: "/sr/app/messages" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/images/logos/logo-emblem.png",
    badge: "/images/logos/logo-emblem.png",
    tag: payload.tag || "nauciai-notification",
    renotify: Boolean(payload.renotify),
    data: { url: payload.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const fallback = new URL("/sr/app/messages", self.location.origin);
  const requested = new URL(event.notification.data?.url || fallback.pathname, self.location.origin);
  const target = requested.origin === self.location.origin ? requested.href : fallback.href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if ("focus" in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
