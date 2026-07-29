import { LocalNotifications } from "@capacitor/local-notifications";
import { ensureNotificationPermission, isNative, storage, vibrate } from "./native";

const NOTIFICATION_ID = 77;
const DURATION_KEY = "fitai.rest_seconds";
export const REST_PRESETS = [60, 90, 120, 180] as const;
export const DEFAULT_REST_SECONDS = 90;

export async function loadRestDuration(): Promise<number> {
  const raw = await storage.get(DURATION_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REST_SECONDS;
}

export async function saveRestDuration(seconds: number): Promise<void> {
  await storage.set(DURATION_KEY, String(seconds));
}

/**
 * Ставит системное уведомление на момент окончания отдыха. Оно и есть источник
 * правды: даже если приложение свернут или убьют, сигнал придёт вовремя.
 */
export async function armRestNotification(seconds: number, exerciseName: string): Promise<void> {
  if (!isNative) return;
  if (!(await ensureNotificationPermission())) return;
  await cancelRestNotification();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: "Отдых закончен",
        body: `Следующий подход: ${exerciseName}`,
        schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
      },
    ],
  });
}

export async function cancelRestNotification(): Promise<void> {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] }).catch(() => {});
}

export function restFinishedFeedback(): void {
  vibrate.heavy();
  window.setTimeout(vibrate.heavy, 220);
}

export function formatRest(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
