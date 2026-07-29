import { LocalNotifications } from "@capacitor/local-notifications";
import { api } from "./api";
import { ensureNotificationPermission, isNative } from "./native";
import type { ReminderData } from "../types";

/** Диапазон id для напоминаний — не пересекается с таймером отдыха (см. restTimer.ts). */
const REMINDER_ID_BASE = 1000;

const TITLES: Record<string, string> = {
  weight: "Утренний вес",
  nutrition: "Питание",
  workout: "Пора тренироваться",
  photo: "Фото формы",
};

function notificationId(reminder: ReminderData): number {
  return REMINDER_ID_BASE + reminder.id;
}

/**
 * Переносит серверные напоминания в системные уведомления Android,
 * чтобы они приходили без запущенного Telegram-бота.
 */
export async function scheduleReminderNotifications(): Promise<number> {
  if (!isNative) return 0;
  if (!(await ensureNotificationPermission())) return 0;

  let reminders: ReminderData[];
  try {
    reminders = await api.reminders();
  } catch {
    return 0;
  }

  const pending = await LocalNotifications.getPending();
  const stale = pending.notifications.filter(
    (item) => item.id >= REMINDER_ID_BASE && item.id < REMINDER_ID_BASE + 1000,
  );
  if (stale.length) {
    await LocalNotifications.cancel({ notifications: stale.map((item) => ({ id: item.id })) });
  }

  const active = reminders.filter((item) => item.isActive);
  if (!active.length) return 0;

  await LocalNotifications.schedule({
    notifications: active.map((reminder) => {
      const [hour, minute] = reminder.localTime.split(":").map(Number);
      return {
        id: notificationId(reminder),
        title: TITLES[reminder.type] ?? "FIT AI",
        body: reminder.message || "Загляни в FIT AI",
        schedule: {
          on: { hour: hour || 0, minute: minute || 0 },
          repeats: true,
          allowWhileIdle: true,
        },
      };
    }),
  });
  return active.length;
}

export async function cancelReminderNotifications(): Promise<void> {
  if (!isNative) return;
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter(
    (item) => item.id >= REMINDER_ID_BASE && item.id < REMINDER_ID_BASE + 1000,
  );
  if (ours.length) {
    await LocalNotifications.cancel({ notifications: ours.map((item) => ({ id: item.id })) });
  }
}
