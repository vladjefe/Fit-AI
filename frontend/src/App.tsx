import { AnimatePresence } from "framer-motion";
import { Check, WifiOff } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { Page } from "./components/Page";
import { mockDashboard } from "./data/mockData";
import { useTelegram } from "./hooks/useTelegram";
import { HomeScreen } from "./screens/HomeScreen";
import { api } from "./services/api";
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

export default function App() {
  const { user, haptic } = useTelegram();
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [workoutLocked, setWorkoutLocked] = useState(false);

  async function refreshDashboard(active = true) {
    const data = await api.dashboard();
    if (!active) return;
    setDashboard({
      ...data,
      userName: user?.first_name ?? data.userName,
    });
  }

  useEffect(() => {
    let active = true;
    refreshDashboard(active)
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные");
      });
    return () => {
      active = false;
    };
  }, [user?.first_name]);

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
