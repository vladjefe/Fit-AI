import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";

export const isNative = Capacitor.isNativePlatform();

/**
 * Preferences пишет в нативное хранилище на Android и в localStorage в браузере,
 * поэтому один и тот же код работает в APK и в dev-режиме.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  },
  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  },
};

export const vibrate = {
  tap: () => void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}),
  heavy: () => void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}),
  success: () => void Haptics.notification({ type: NotificationType.Success }).catch(() => {}),
  select: () => void Haptics.selectionStart().catch(() => {}),
};

let notificationsReady: Promise<boolean> | null = null;

export function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative) return Promise.resolve(false);
  notificationsReady ??= (async () => {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === "granted";
  })().catch(() => false);
  return notificationsReady;
}

export async function isOnline(): Promise<boolean> {
  if (!isNative) return navigator.onLine;
  const status = await Network.getStatus();
  return status.connected;
}

export function onNetworkChange(handler: (connected: boolean) => void): () => void {
  if (!isNative) {
    const online = () => handler(true);
    const offline = () => handler(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }
  const listener = Network.addListener("networkStatusChange", (status) => {
    handler(status.connected);
  });
  return () => void listener.then((item) => item.remove());
}
