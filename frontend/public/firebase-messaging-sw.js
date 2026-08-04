/* global firebase */
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");

const firebaseApiKey = new URL(self.location.href).searchParams.get("firebaseApiKey");
if (!firebaseApiKey) {
  throw new Error("Firebase API key was not provided when registering the service worker.");
}

firebase.initializeApp({
  apiKey: firebaseApiKey,
  authDomain: "aivle25.firebaseapp.com",
  projectId: "aivle25",
  storageBucket: "aivle25.firebasestorage.app",
  messagingSenderId: "191445593991",
  appId: "1:191445593991:web:5c5aae907bcc3eaaaaad22",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  // Firebase가 notification payload를 자동으로 표시하므로 data-only 메시지만 직접 표시합니다.
  if (payload.notification) return;

  const title = payload.data?.title || "Smart Shipyard 안전 알림";
  const options = {
    body: payload.data?.body || "새로운 안전 알림이 도착했습니다.",
    icon: "/favicon.png",
    data: { url: payload.data?.url || "/worker/work" },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/worker/work", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      const existingClient = windowClients.find(client => client.url.startsWith(self.location.origin));
      if (existingClient) {
        return existingClient.navigate(targetUrl).then(client => client.focus());
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
