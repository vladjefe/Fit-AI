import { App as CapacitorApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { AnimatePresence } from "framer-motion";
import { Check, CloudOff, WifiOff } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { Page } from "./components/Page";
import { useTelegram } from "./hooks/useTelegram";
import { HomeScreen } from "./screens/HomeScreen";
import { PairingScreen } from "./screens/PairingScreen";
import { api, NotPairedError } from "./services/api";
import { loadToken } from "./services/auth";
import { ensureNotificationPermission, isNative } from "./services/native";
import { startAutoSync, subscribePending, syncPending } from "./services/offlineQueue";
import { scheduleReminderNotifications } from "./services/reminders";
import type { AppTab, DashboardData } from "./types";

const WorkoutScreen = lazy(() =>
  import("./screens/WorkoutScreen").then((module) => ({ default: module.WorkoutScreen })),
);
const ProgressScreen = lazy(() =>
  import("./screens/ProgressScreen").then((module) => ({ default: module.ProgressScreen })),
);
const GoalsScreen = lazy(() =>
  import("./screens/GoalsScreen").then((module) => ({ default: module.GoalsScreen })),
);
const ProfileScreen = lazy(() =>
  import("./screens/ProfileScreen").then((module) => ({ default: module.ProfileScreen })),
);

type AuthState = "checking" | "unpaired" | "ready";

export default function App() {
  const { user, haptic } = useTelegram();
  const [auth, setAuth] = useState<AuthState>("checking");
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [workoutLocked, setWorkoutLocked] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

  async function refreshDashboard(active = true) {
    const data = await api.dashboard();
    if (!active) return;
    setDashboard({
      ...data,
      userName: user?.first_name ?? data.userName,
    });
  }

  // Нативная оболочка: тёмный статус-бар и скрытие splash после первой отрисовки.
  useEffect(() => {
    if (!isNative) return;
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    void StatusBar.setBackgroundColor({ color: "#090b0a" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (auth === "checking") return;
    void SplashScreen.hide().catch(() => {});
  }, [auth]);

  useEffect(() => {
    let active = true;
    void loadToken().then((token) => {
      if (!active) return;
      const hasTelegram = Boolean(window.Telegram?.WebApp?.initData);
      setAuth(token || hasTelegram || api.isMock ? "ready" : "unpaired");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (auth !== "ready") return;
    let active = true;
    refreshDashboard(active).catch((reason: unknown) => {
      if (!active) return;
      if (reason instanceof NotPairedError) {
        setAuth("unpaired");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные");
    });
    return () => {
      active = false;
    };
  }, [auth, user?.first_name]);

  // Догоняем оффлайн-очередь и переносим напоминания в системные уведомления.
  useEffect(() => {
    if (auth !== "ready") return;
    const unsubscribe = subscribePending(setPendingSync);
    const stopAutoSync = startAutoSync();
    if (!isNative) return () => {
      unsubscribe();
      stopAutoSync();
    };

    void ensureNotificationPermission().then(() => scheduleReminderNotifications());
    const listener = CapacitorApp.addListener("resume", () => {
      void syncPending().then((result) => {
        if (result.sent > 0) void refreshDashboard();
      });
    });
    return () => {
      unsubscribe();
      stopAutoSync();
      void listener.then((item) => item.remove());
    };
  }, [auth]);

  // Аппаратная кнопка «Назад»: с вкладки уводит на главную, с главной сворачивает.
  useEffect(() => {
    if (!isNative) return;
    const listener = CapacitorApp.addListener("backButton", () => {
      if (workoutLocked) return;
      if (activeTab !== "home") {
        setActiveTab("home");
        return;
      }
      void CapacitorApp.minimizeApp();
    });
    return () => void listener.then((item) => item.remove());
  }, [activeTab, workoutLocked]);

  function navigate(tab: AppTab) {
    haptic.select();
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message: string) {
    haptic.success();
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  if (auth === "checking") {
    return <LoadingScreen />;
  }

  if (auth === "unpaired") {
    return (
      <PairingScreen
        onPaired={() => {
          setError(null);
          setAuth("ready");
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-[520px] place-items-center bg-app p-6 text-center">
        <div>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-400/10 text-red-300"><WifiOff size={28} /></div>
          <h1 className="mt-5 text-xl font-extrabold">Нет связи с FIT AI</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-5 rounded-2xl bg-accent px-5 py-3 text-sm font-extrabold text-ink">Повторить</button>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-dvh bg-[#050605] text-white selection:bg-accent/25">
      <div className="relative mx-auto min-h-dvh max-w-[520px] overflow-x-hidden bg-app shadow-[0_0_80px_rgba(0,0,0,.5)]">
        <AnimatePresence mode="wait" initial={false}>
          <Page key={activeTab}>
            <Suspense fallback={<PageFallback />}>
              {activeTab === "home" && (
                <HomeScreen
                  data={dashboard}
                  onNavigate={navigate}
                  onDataChanged={() => refreshDashboard()}
                />
              )}
              {activeTab === "workout" && (
                <WorkoutScreen
                  data={dashboard}
                  haptic={haptic}
                  onSessionActive={setWorkoutLocked}
                  onDataChanged={() => refreshDashboard()}
                />
              )}
              {activeTab === "progress" && <ProgressScreen />}
              {activeTab === "goals" && <GoalsScreen onToast={showToast} />}
              {activeTab === "profile" && (
                <ProfileScreen userName={dashboard.userName} onNavigate={navigate} onToast={showToast} />
              )}
            </Suspense>
          </Page>
        </AnimatePresence>

        {pendingSync > 0 && (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-[520px] justify-center px-4 pt-[max(8px,env(safe-area-inset-top))]">
            <span className="flex items-center gap-1.5 rounded-full border border-orange-300/20 bg-[#241d10]/95 px-3 py-1.5 text-[10px] font-extrabold text-orange-200 backdrop-blur-xl">
              <CloudOff size={12} /> Ждут отправки: {pendingSync}
            </span>
          </div>
        )}

        {!workoutLocked && <BottomNav active={activeTab} onChange={navigate} />}

        <AnimatePresence>
          {toast && (
            <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-[520px] justify-center px-4">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#202420]/95 px-4 py-3 text-xs font-bold shadow-2xl backdrop-blur-xl">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-ink"><Check size={14} strokeWidth={3} /></span>
                {toast}
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PageFallback() {
  return <div className="h-72 animate-pulse rounded-[22px] bg-white/[0.045]" />;
}

function LoadingScreen() {
  return (
    <div className="mx-auto min-h-dvh max-w-[520px] bg-app px-4 pt-8">
      <div className="animate-pulse space-y-5">
        <div className="flex items-center justify-between">
          <div><div className="h-3 w-28 rounded bg-white/[0.06]" /><div className="mt-3 h-7 w-48 rounded bg-white/[0.08]" /></div>
          <div className="h-10 w-10 rounded-full bg-white/[0.06]" />
        </div>
        <div className="h-[300px] rounded-[22px] bg-white/[0.06]" />
        <div className="grid grid-cols-2 gap-3"><div className="h-40 rounded-[22px] bg-white/[0.05]" /><div className="h-40 rounded-[22px] bg-white/[0.05]" /></div>
      </div>
    </div>
  );
}
