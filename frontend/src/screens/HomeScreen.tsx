import {
  Activity,
  ArrowRight,
  ChevronRight,
  Dumbbell,
  Flame,
  Sparkles,
  Timer,
  TrendingDown,
  Weight,
  Utensils,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ProgressRing } from "../components/ProgressRing";
import { QuickLogModal } from "../components/QuickLogModal";
import type { QuickLogKind } from "../components/QuickLogModal";
import type { AppTab, DashboardData } from "../types";

interface HomeScreenProps {
  data: DashboardData;
  onNavigate: (tab: AppTab) => void;
  onDataChanged: () => Promise<void> | void;
}

export function HomeScreen({ data, onNavigate, onDataChanged }: HomeScreenProps) {
  const [quickLog, setQuickLog] = useState<QuickLogKind | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const caloriesToday = data.nutritionToday?.calories ?? null;
  const proteinToday = data.nutritionToday?.proteinG ?? null;
  const date = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between px-1">
        <div>
          <p className="capitalize text-xs font-semibold text-muted">{date}</p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.04em]">
            Привет, {data.userName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-10 items-center gap-1.5 rounded-full border border-orange-300/10 bg-orange-300/[0.07] px-3 text-sm font-extrabold text-orange-300">
            <Flame size={16} fill="currentColor" /> 9
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-accent to-[#6ea522] text-sm font-extrabold text-ink">
            А
          </div>
        </div>
      </header>

      <Card className="relative overflow-hidden border-accent/10 bg-gradient-to-br from-[#222b19] via-[#151914] to-[#111411] p-5">
        <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-accent/[0.12] blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
              Цикл {data.cycleNumber} · {data.nextWorkout.position}/4
            </span>
            <Dumbbell className="text-accent" size={24} />
          </div>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-white/40">
            {data.activeSessionId ? "Тренировка идёт" : "Выбранная тренировка"}
          </p>
          <h2 className="mt-1 text-[36px] font-extrabold leading-none tracking-[-0.055em]">
            {data.nextWorkout.name}
          </h2>
          <div className="mt-4 flex items-center gap-4 text-sm font-semibold text-white/55">
            <span className="flex items-center gap-1.5">
              <Activity size={15} /> {data.nextWorkout.exercises.length} упражнений
            </span>
            <span className="flex items-center gap-1.5">
              <Timer size={15} /> ~{data.nextWorkout.durationMinutes} мин
            </span>
          </div>
          <Button fullWidth className="mt-6" onClick={() => onNavigate("workout")}>
            Начать тренировку <ArrowRight size={18} />
          </Button>
        </div>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-base font-extrabold tracking-[-0.025em]">Сегодня</h2>
          <button className="flex items-center text-xs font-bold text-muted" onClick={() => onNavigate("progress")}>
            Подробнее <ChevronRight size={15} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={Weight}
            iconTone="bg-sky-400/10 text-sky-300"
            label="Вес"
            value={`${data.weight.current}`}
            unit="кг"
            meta={<span className="flex items-center gap-1 text-emerald-300"><TrendingDown size={12} /> {Math.abs(data.weight.delta)} кг</span>}
            progress={data.weight.target / data.weight.current}
          />
          <MetricCard
            icon={Dumbbell}
            iconTone="bg-violet-400/10 text-violet-300"
            label="Подтягивания"
            value={`${data.pullUps.current}`}
            unit={`/ ${data.pullUps.target}`}
            meta="Личный рекорд"
            progress={data.pullUps.current / data.pullUps.target}
          />
          <MetricCard
            icon={Utensils}
            iconTone="bg-orange-400/10 text-orange-300"
            label="Питание"
            value={caloriesToday ? `${caloriesToday}` : "—"}
            unit="ккал"
            meta={proteinToday ? `Белок ${proteinToday} г` : "Сегодня ещё не записано"}
            progress={proteinToday ? Math.min(1, proteinToday / 160) : 0}
          />
          <motion.button whileTap={{ scale: 0.98 }} className="text-left" onClick={() => onNavigate("progress")}>
            <Card className="h-full p-4">
              <div className="flex items-start justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent">
                  <Sparkles size={18} />
                </div>
                <ProgressRing value={data.aiStatus.score} size={40} strokeWidth={4} label={`${data.aiStatus.score}`} />
              </div>
              <p className="mt-4 text-xs font-semibold text-muted">AI-статус</p>
              <p className="mt-1 text-[15px] font-extrabold leading-tight">{data.aiStatus.label}</p>
              <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/40">{data.aiStatus.insight}</p>
            </Card>
          </motion.button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 px-1 text-base font-extrabold tracking-[-0.025em]">Быстрый ввод</h2>
        <div className="grid grid-cols-2 gap-2">
          <QuickButton icon={Weight} label="Вес" onClick={() => setQuickLog("weight")} />
          <QuickButton icon={Utensils} label="Питание" onClick={() => setQuickLog("nutrition")} />
        </div>
        {savedMessage && (
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} role="status" className="mt-3 rounded-xl bg-accent/10 px-3 py-2 text-xs font-bold text-accent">
            {savedMessage}
          </motion.p>
        )}
      </section>

      <Card tone="soft" className="flex items-center gap-3 p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent">
          <Sparkles size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">Фокус недели</p>
          <p className="mt-0.5 truncate text-xs text-muted">Держи белок и не спеши повышать объем</p>
        </div>
        <ChevronRight size={18} className="text-white/25" />
      </Card>
      <QuickLogModal
        key={quickLog ?? "closed"}
        kind={quickLog}
        onClose={() => setQuickLog(null)}
        onSaved={(message) => {
          setSavedMessage(message);
          void onDataChanged();
          window.setTimeout(() => setSavedMessage(null), 3000);
        }}
      />
    </div>
  );
}

function QuickButton({ icon: Icon, label, onClick }: { icon: typeof Weight; label: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onClick} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.04] text-xs font-extrabold">
      <Icon size={19} className="text-accent" /> {label}
    </motion.button>
  );
}

interface MetricCardProps {
  icon: typeof Weight;
  iconTone: string;
  label: string;
  value: string;
  unit: string;
  meta: React.ReactNode;
  progress: number;
}

function MetricCard({ icon: Icon, iconTone, label, value, unit, meta, progress }: MetricCardProps) {
  return (
    <Card className="p-4">
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${iconTone}`}>
        <Icon size={18} />
      </div>
      <p className="mt-4 text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1 text-[27px] font-extrabold leading-none tracking-[-0.04em]">
        {value} <span className="text-xs font-bold text-white/35">{unit}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, progress * 100)}%` }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="h-full rounded-full bg-accent"
        />
      </div>
      <div className="mt-2 text-[10px] font-semibold text-white/38">{meta}</div>
    </Card>
  );
}
