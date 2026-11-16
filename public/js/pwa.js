// Service worker registration and Web Push subscription. On iPhone, push works once the app
// is added to the Home Screen (iOS 16.4 and later), and permission must come from a tap.

import { api, toast } from "./lib.js";

const keyBytes = (b64) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function setupPwa() {
  const button = document.querySelector("[data-push-toggle]");
  if (!("serviceWorker" in navigator)) {
    button.hidden = true;
    return;
  }
  const reg = await navigator.serviceWorker.register("sw.js").catch(() => null);
  if (!reg || !("PushManager" in window) || !("Notification" in window)) {
    button.textContent = "Notifications: add to Home Screen first";
    button.disabled = true;
    return;
  }

  const sync = async () => {
    const sub = await reg.pushManager.getSubscription();
    button.textContent = sub ? "Notifications on (send a test)" : "Turn on notifications";
    return sub;
  };
  await sync();

  button.addEventListener("click", async () => {
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        const res = await api("api/push/test", { method: "POST", body: {} });
        toast(
          res.sent
            ? "Test notification sent."
            : "No device took the test. Try turning notifications off and on.",
        );
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        toast("Notifications are blocked. Allow them in Settings.");
        return;
      }
      const { publicKey } = await api("api/push/key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      await api("api/push/subscribe", { method: "POST", body: sub.toJSON() });
      toast("Notifications are on.");
      await sync();
    } catch (err) {
      toast(err.message);
    }
  });
}
