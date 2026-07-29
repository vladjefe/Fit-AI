import {
  Bell,
  Clock3,
  CloudOff,
  Dumbbell,
  HelpCircle,
  Languages,
  LockKeyhole,
  LogOut,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Timer,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Card } from "../components/Card";
import { api } from "../services/api";
import { forgetToken } from "../services/auth";
import { subscribePending, syncPending } from "../services/offlineQueue";
import {
  DEFAULT_REST_SECONDS,
  formatRest,
  loadRestDuration,
  REST_PRESETS,
  saveRestDuration,
} from "../services/restTimer";
import type { AppTab } from "../types";
import type { ReminderData } from "../types";

export function ProfileScreen({
  userName,
  onNavigate,
  onToast,
}: {
  userName: string;
  onNavigate: (tab: AppTab) => void;
  onToast: (message: string) => void;
}) {
  const [reminders, setReminders] = useState<ReminderData[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(true);
  const [savingReminders, setSavingReminders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void loadRestDuration().then(setRestSeconds);
    return subscribePending(setPending);
  }, []);

  function cycleRestDuration() {
    const next = REST_PRESETS[(REST_PRESETS.indexOf(restSeconds as never) + 1) % REST_PRESETS.length];
    setRestSeconds(next);
    void saveRestDuration(next);
    onToast(`Отдых между подходами: ${formatRest(next)}`);
  }

  async function unpairDevice() {
    await forgetToken();
    window.location.reload();
  }

  useEffect(() => {
    let active = true;
    api
      .reminders()
      .then((items) => {
        if (active) setReminders(items);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить напоминания");
      })
      .finally(() => {
        if (active) setLoadingReminders(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const remindersEnabled = reminders.length > 0 && reminders.some((item) => item.isActive);
  const reminderTime = useMemo(() => {
    const firstActive = reminders.find((item) => item.isActive) ?? reminders[0];
    return firstActive?.localTime ?? "—";
  }, [reminders]);

  async function toggleReminders(value: boolean) {
    if (savingReminders || !reminders.length) return;
    setSavingReminders(true);
    setError(null);
    try {
      const updated = await Promise.all(
        reminders.map((item) => api.updateReminder(item.id, { isActive: value })),
      );
      setReminders(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить напоминания");
    } finally {
      setSavingReminders(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="px-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Аккаунт</p>
        <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.05em]">Профиль</h1>
      </header>

      <Card className="relative overflow-hidden p-5">
        <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/[0.08] blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-accent to-[#759f2b] text-xl font-black text-ink">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-extrabold">{userName}</h2>
            <p className="mt-1 text-xs text-muted">Telegram · владелец</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-1 text-[10px] font-extrabold text-accent"><ShieldCheck size={11} /> Защищено Telegram</span>
          </div>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold text-red-200">
          {error}
        </p>
      )}

      <SettingsGroup title="Тренировки">
        <SettingsRow icon={Dumbbell} title="Тренер" value="Не подключен" onClick={() => onToast("Тренера пока нет в настройках")} />
        <SettingsRow
          icon={Timer}
          title="Отдых между подходами"
          value={formatRest(restSeconds)}
          onClick={cycleRestDuration}
        />
        <SettingsRow
          icon={Clock3}
          title="Напоминания"
          value={loadingReminders ? "Загрузка…" : remindersEnabled ? reminderTime : "Выключены"}
          trailing={<Toggle enabled={remindersEnabled} disabled={savingReminders || loadingReminders || !reminders.length} onChange={toggleReminders} />}
        />
        <SettingsRow icon={Target} title="Создать цель" value="Открыть" onClick={() => onNavigate("goals")} />
        <SettingsRow icon={SlidersHorizontal} title="Единицы измерения" value="Килограммы" onClick={() => onToast("Сейчас используются килограммы")} />
      </SettingsGroup>

      <SettingsGroup title="Приложение">
        <SettingsRow icon={Moon} title="Оформление" value="Темное" onClick={() => onToast("Темная тема уже включена")} />
        <SettingsRow icon={Languages} title="Язык" value="Русский" onClick={() => onToast("Интерфейс сейчас на русском")} />
        <SettingsRow icon={Bell} title="Уведомления" value={remindersEnabled ? "Включены" : "Выключены"} onClick={() => onToast("Уведомления управляются через напоминания")} />
      </SettingsGroup>

      <SettingsGroup title="Безопасность">
        <SettingsRow icon={LockKeyhole} title="Данные и приватность" value="Открыть" onClick={() => onToast("Фото и AI доступны только владельцу")} />
        <SettingsRow
          icon={CloudOff}
          title="Не отправлено"
          value={pending > 0 ? `${pending} записей` : "Всё синхронизировано"}
          onClick={() =>
            void syncPending().then((result) =>
              onToast(result.sent > 0 ? `Отправлено: ${result.sent}` : "Нечего отправлять"),
            )
          }
        />
        <SettingsRow icon={HelpCircle} title="Помощь" value="/start" onClick={() => onToast("Открой бота и нажми /start")} />
        <SettingsRow
          icon={LogOut}
          title="Отвязать устройство"
          value="Выйти"
          onClick={() => void unpairDevice()}
        />
      </SettingsGroup>

      <div className="px-4 pb-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/20">FIT AI · версия 1.1.0</p>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 px-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted">{title}</p>
      <Card className="divide-y divide-white/[0.06] overflow-hidden">{children}</Card>
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  title,
  value,
  trailing,
  disabled = false,
  onClick,
}: {
  icon: typeof UserRound;
  title: string;
  value?: string;
  trailing?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-white/55"><Icon size={17} /></div>
      <span className="flex-1 text-sm font-bold">{title}</span>
      {value && <span className="text-[11px] font-semibold text-muted">{value}</span>}
      {trailing}
    </>
  );
  if (trailing) {
    return (
      <div className={`flex min-h-[58px] w-full items-center gap-3 px-4 text-left ${disabled ? "opacity-60" : ""}`}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`flex min-h-[58px] w-full items-center gap-3 px-4 text-left ${disabled ? "opacity-60" : ""}`}
    >
      {content}
    </button>
  );
}

function Toggle({ enabled, disabled, onChange }: { enabled: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative h-7 w-12 rounded-full p-1 transition disabled:opacity-50 ${enabled ? "bg-accent" : "bg-white/10"}`}
    >
      <span className={`block h-5 w-5 rounded-full shadow transition ${enabled ? "translate-x-5 bg-ink" : "translate-x-0 bg-white/60"}`} />
    </button>
  );
}
