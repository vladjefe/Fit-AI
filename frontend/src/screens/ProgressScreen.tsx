import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Dumbbell,
  Flame,
  Sparkles,
  Trash2,
  Utensils,
  Weight,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ExerciseImage } from "../components/ExerciseImage";
import { api } from "../services/api";
import type { ProgressData, WorkoutDetail } from "../types";

type ChartMode = "weight" | "nutrition";

export function ProgressScreen() {
  const [weeks, setWeeks] = useState(4);
  const [chart, setChart] = useState<ChartMode>("weight");
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadProgress(active = true) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.progress(weeks);
      if (active) setProgress(data);
    } catch (reason) {
      if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить прогресс");
    } finally {
      if (active) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadProgress(active);
    return () => {
      active = false;
    };
  }, [weeks]);

  const weightChart = useMemo(
    () =>
      (progress?.bodyWeight ?? []).map((item) => ({
        label: formatShortDate(item.measuredAt),
        value: item.weightKg,
      })),
    [progress?.bodyWeight],
  );

  const nutritionChart = useMemo(
    () =>
      (progress?.nutrition ?? []).map((item) => ({
        label: formatShortDate(item.logDate),
        calories: item.calories ?? 0,
        protein: item.proteinG ?? 0,
      })),
    [progress?.nutrition],
  );

  async function runAnalysis() {
    if (analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await api.weeklyAnalysis();
      setAnalysis(result.analysis);
    } catch (reason) {
      setAnalysisError(reason instanceof Error ? reason.message : "Не удалось запустить AI-анализ");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function openWorkoutDetail(sessionId: number) {
    setDetailLoadingId(sessionId);
    setDetailError(null);
    try {
      setDetail(await api.workoutDetail(sessionId));
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : "Не удалось открыть тренировку");
    } finally {
      setDetailLoadingId(null);
    }
  }

  async function deleteWorkout(sessionId: number) {
    if (deleting) return;
    setDeleting(true);
    setDetailError(null);
    try {
      await api.deleteWorkout(sessionId);
      setDetail(null);
      await loadProgress();
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : "Не удалось удалить тренировку");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <header className="px-1">
          <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-3 h-8 w-44 animate-pulse rounded bg-white/[0.08]" />
        </header>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-[22px] bg-white/[0.05]" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-[22px] bg-white/[0.05]" />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Прогресс не загрузился" description={error} />;
  }

  const weightDelta = progress?.weightStats.changeKg ?? null;

  return (
    <div className="space-y-5">
      <header className="px-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Твоя динамика</p>
        <div className="mt-1 flex items-end justify-between">
          <h1 className="text-[30px] font-extrabold tracking-[-0.05em]">Прогресс</h1>
          <div className="flex rounded-xl bg-white/[0.05] p-1">
            {[4, 8].map((item) => (
              <button
                key={item}
                onClick={() => setWeeks(item)}
                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold ${weeks === item ? "bg-white/10 text-white" : "text-muted"}`}
              >
                {item} нед
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Weight}
          label="Вес"
          value={progress?.weightStats.latestKg ? `${progress.weightStats.latestKg.toFixed(1)} кг` : "нет данных"}
          delta={weightDelta === null ? "—" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} кг`}
          positive={weightDelta === null ? true : weightDelta <= 0}
        />
        <StatCard
          icon={Flame}
          label="Средние калории"
          value={progress?.nutritionStats.averageCalories ? `${progress.nutritionStats.averageCalories}` : "нет данных"}
          unit="ккал"
          delta={`${progress?.nutritionStats.loggedDays ?? 0} дней`}
          positive
        />
        <StatCard
          icon={Utensils}
          label="Средний белок"
          value={progress?.nutritionStats.averageProteinG ? `${progress.nutritionStats.averageProteinG}` : "нет данных"}
          unit="г"
          delta="питание"
          positive
        />
        <StatCard
          icon={Dumbbell}
          label="Тренировки"
          value={`${progress?.workoutsCompleted ?? 0}`}
          delta={`за ${weeks} нед`}
          positive
        />
      </div>

      <Card className="overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold">Статистика</p>
            <p className="mt-0.5 text-[11px] text-muted">Последние {weeks} недели</p>
          </div>
          <div className="flex rounded-xl bg-white/[0.05] p-1">
            <button onClick={() => setChart("weight")} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold ${chart === "weight" ? "bg-accent text-ink" : "text-muted"}`}>Вес</button>
            <button onClick={() => setChart("nutrition")} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold ${chart === "nutrition" ? "bg-accent text-ink" : "text-muted"}`}>Питание</button>
          </div>
        </div>
        <div className="mt-5 h-[220px] w-full">
          {chart === "weight" && weightChart.length < 2 ? (
            <EmptyState title="Пока мало замеров" description="Добавь 2–3 записи веса — здесь появится динамика." />
          ) : chart === "nutrition" && nutritionChart.length < 1 ? (
            <EmptyState title="Питание не записано" description="Запиши калории и белок — здесь появится статистика." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chart === "weight" ? (
                <AreaChart data={weightChart} margin={{ top: 8, right: 4, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b7f34a" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#b7f34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,.045)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#696f6b", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#696f6b", fontSize: 9 }} axisLine={false} tickLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#929892" }} itemStyle={{ color: "#fff" }} formatter={(value) => [`${value} кг`, "Вес"]} />
                  <Area type="monotone" dataKey="value" stroke="#b7f34a" strokeWidth={2.5} fill="url(#weightFill)" animationDuration={500} activeDot={{ r: 5, fill: "#b7f34a", stroke: "#111411", strokeWidth: 3 }} />
                </AreaChart>
              ) : (
                <BarChart data={nutritionChart} margin={{ top: 8, right: 4, left: -25, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,.045)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#696f6b", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#696f6b", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.03)" }} formatter={(value, name) => [value, name === "calories" ? "Ккал" : "Белок, г"]} />
                  <Bar dataKey="calories" fill="#b7f34a" radius={[6, 6, 2, 2]} maxBarSize={22} animationDuration={500} />
                  <Bar dataKey="protein" fill="#fb923c" radius={[6, 6, 2, 2]} maxBarSize={22} animationDuration={500} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Sparkles size={19} /></div>
          <div className="flex-1">
            <p className="text-sm font-extrabold">AI-разбор недели</p>
            <p className="mt-0.5 text-[11px] text-muted">Вес, питание и силовые тренировки за последние 7 дней</p>
          </div>
        </div>
        {analysis && <p className="mt-4 whitespace-pre-line rounded-2xl bg-white/[0.04] p-4 text-xs leading-relaxed text-white/70">{analysis}</p>}
        {analysisError && <p role="alert" className="mt-3 text-xs font-semibold text-red-200">{analysisError}</p>}
        <Button fullWidth variant="secondary" className="mt-4" onClick={() => void runAnalysis()} disabled={analysisLoading}>
          <Sparkles size={17} /> {analysisLoading ? "Анализирую…" : analysis ? "Обновить анализ" : "Запустить AI-анализ"}
        </Button>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-base font-extrabold">Последние тренировки</h2>
          <span className="text-xs font-bold text-muted">{progress?.workouts.length ?? 0}</span>
        </div>
        {progress?.workouts.length ? (
          <Card className="divide-y divide-white/[0.06] overflow-hidden">
            {[...progress.workouts].reverse().map((item) => (
              <button
                key={item.id}
                onClick={() => void openWorkoutDetail(item.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
                disabled={detailLoadingId === item.id}
              >
                <span className="h-10 w-1 rounded-full bg-accent" />
                <div className="flex-1">
                  <p className="text-sm font-extrabold">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatLongDate(item.completedAt)} · {item.exerciseCount ?? 0} упражнений
                  </p>
                </div>
                {detailLoadingId === item.id ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
                ) : (
                  <ChevronRight size={17} className="text-white/20" />
                )}
              </button>
            ))}
          </Card>
        ) : (
          <EmptyState title="Пока нет тренировок" description="Заверши первую тренировку — она появится здесь с упражнениями и подходами." />
        )}
      </section>

      {detailError && !detail && (
        <p role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold text-red-200">
          {detailError}
        </p>
      )}
      <AnimatePresence>
        {detail && (
          <WorkoutDetailModal
            detail={detail}
            error={detailError}
            deleting={deleting}
            onClose={() => {
              setDetail(null);
              setDetailError(null);
            }}
            onDelete={() => void deleteWorkout(detail.sessionId)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkoutDetailModal({
  detail,
  error,
  deleting,
  onClose,
  onDelete,
}: {
  detail: WorkoutDetail;
  error: string | null;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ y: 28 }}
        animate={{ y: 0 }}
        exit={{ y: 28 }}
        className="mx-auto flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#171a17] shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.06] p-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Детали тренировки</p>
            <h2 className="mt-1 text-xl font-extrabold">{detail.workoutName}</h2>
            <p className="mt-1 text-xs text-muted">{formatLongDate(detail.completedAt)}</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {detail.exercises.map((exercise) => (
              <div key={exercise.id} className="overflow-hidden rounded-2xl bg-white/[0.04]">
                <ExerciseImage imageKey={exercise.imageKey} alt={exercise.name} className="h-36" />
                <div className="p-4">
                  <p className="text-sm font-extrabold">{exercise.name}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {exercise.sets.map((set) => (
                      <div key={set.setNumber} className="rounded-xl bg-black/20 p-3 text-center">
                        <p className="text-[10px] font-bold text-muted">Подход {set.setNumber}</p>
                        <p className="mt-1 text-lg font-extrabold">{set.reps}</p>
                        <p className="mt-0.5 text-[10px] text-white/35">{set.weightKg ?? 0} кг</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">{error}</p>}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/[0.06] p-4">
          <Button variant="secondary" onClick={onClose}>Закрыть</Button>
          <Button variant="secondary" onClick={onDelete} disabled={deleting}>
            <Trash2 size={17} /> {deleting ? "Удаляю…" : "Удалить тест"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const tooltipStyle = {
  background: "#171a18",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  fontSize: 11,
};

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  positive,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta: string;
  positive?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.055] text-white/65"><Icon size={18} /></div>
        <span className={`flex items-center gap-0.5 text-[10px] font-extrabold ${positive ? "text-emerald-300" : "text-red-300"}`}>
          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {delta}
        </span>
      </div>
      <p className="mt-4 text-[11px] font-semibold text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1 text-xl font-extrabold tracking-[-0.03em]">
        {value}
        {unit && <span className="text-xs text-white/35">{unit}</span>}
      </p>
    </Card>
  );
}

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formatLongDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(value));
}
