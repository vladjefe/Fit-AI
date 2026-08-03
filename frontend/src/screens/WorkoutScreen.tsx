import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Dumbbell,
  Minus,
  Plus,
  RotateCcw,
  Pencil,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ExerciseImage } from "../components/ExerciseImage";
import { CycleOrderSheet } from "../components/CycleOrderSheet";
import { RestTimer } from "../components/RestTimer";
import { WorkoutBuilder } from "./WorkoutBuilder";
import { api, isQueued } from "../services/api";
import {
  armRestNotification,
  cancelRestNotification,
  DEFAULT_REST_SECONDS,
  loadRestDuration,
} from "../services/restTimer";
import type { DashboardData, Exercise, SavedSet, WorkoutPlan } from "../types";

type Stage = "overview" | "active" | "exercise-result" | "complete";

interface WorkoutScreenProps {
  data: DashboardData;
  onSessionActive: (active: boolean) => void;
  onDataChanged: () => Promise<void> | void;
  haptic: {
    tap: () => void;
    success: () => void;
    select: () => void;
  };
}

export function WorkoutScreen({ data, haptic, onSessionActive, onDataChanged }: WorkoutScreenProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(data.nextWorkout.templateId);
  const workout = useMemo(
    () =>
      data.workoutTemplates.find((item) => item.templateId === selectedTemplateId) ??
      data.nextWorkout,
    [data.nextWorkout, data.workoutTemplates, selectedTemplateId],
  );
  const exercises = workout.exercises;
  const [stage, setStage] = useState<Stage>("overview");
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [reps, setReps] = useState(exercises[0]?.repMax ?? 12);
  const [weight, setWeight] = useState(exercises[0]?.weightKg ?? 0);
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(data.activeSessionStartedAt);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedDurationSeconds, setCompletedDurationSeconds] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [completedWorkoutName, setCompletedWorkoutName] = useState<string | null>(null);
  const [selectedExerciseInfo, setSelectedExerciseInfo] = useState<Exercise | null>(null);
  const [builder, setBuilder] = useState<{ workout: WorkoutPlan | null } | null>(null);
  const [orderingCycle, setOrderingCycle] = useState(false);
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const saveLock = useRef(false);
  const exercise = (exercises[exerciseIndex] ?? exercises[0])!;

  useEffect(() => {
    void loadRestDuration().then(setRestSeconds);
  }, []);

  const startRest = useCallback(
    (seconds: number, name: string) => {
      setRestEndsAt(Date.now() + seconds * 1000);
      void armRestNotification(seconds, name);
    },
    [],
  );

  const stopRest = useCallback(() => {
    setRestEndsAt(null);
    void cancelRestNotification();
  }, []);

  useEffect(() => {
    if (data.activeSessionStartedAt && !startedAt) {
      setStartedAt(data.activeSessionStartedAt);
    }
  }, [data.activeSessionStartedAt, startedAt]);

  useEffect(() => {
    if (!startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const update = () => {
      const started = new Date(startedAt).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };
    update();
    if (stage !== "active" && stage !== "exercise-result") return;
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [stage, startedAt]);

  useEffect(() => {
    if (!data.workoutTemplates.some((item) => item.templateId === selectedTemplateId)) {
      setSelectedTemplateId(data.nextWorkout.templateId);
    }
  }, [data.nextWorkout.templateId, data.workoutTemplates, selectedTemplateId]);

  useEffect(() => {
    const active = stage === "active" || stage === "exercise-result";
    onSessionActive(active);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return () => onSessionActive(false);
  }, [stage, exerciseIndex, onSessionActive]);

  const currentExerciseSets = useMemo(
    () => sets.filter((item) => item.exerciseId === exercise.id),
    [sets, exercise.id],
  );

  async function selectWorkout(templateId: number) {
    if (stage !== "overview" || data.activeSessionId) return;
    const selected = data.workoutTemplates.find((item) => item.templateId === templateId);
    if (!selected) return;
    haptic.select();
    setSelectedTemplateId(templateId);
    setExerciseIndex(0);
    setSetNumber(1);
    setReps(selected.exercises[0]?.repMax ?? 12);
    setWeight(selected.exercises[0]?.weightKg ?? 0);
    setSets([]);
    setSessionId(null);
    setError(null);
    setSyncing(true);
    try {
      await api.selectWorkout(templateId);
      await onDataChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выбрать тренировку");
    } finally {
      setSyncing(false);
    }
  }

  async function start() {
    haptic.tap();
    setSyncing(true);
    setError(null);
    try {
      if (!api.isMock) {
        const response = await api.startWorkout(workout.templateId);
        setSessionId(response.session_id);
        setStartedAt(response.started_at);
      } else {
        setSessionId(101);
        setStartedAt(new Date().toISOString());
      }
      await onDataChanged();
      setStage("active");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось начать тренировку");
    } finally {
      setSyncing(false);
    }
  }

  async function cancelActiveWorkout() {
    if (!data.activeSessionId || syncing) return;
    haptic.tap();
    setSyncing(true);
    setError(null);
    try {
      if (!api.isMock) {
        await api.cancelWorkout(data.activeSessionId);
      }
      restart();
      await onDataChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сбросить тренировку");
    } finally {
      setSyncing(false);
    }
  }

  async function saveCurrentSet() {
    if (saveLock.current) return;
    // Вес 0 — это норма: подтягивания, отжимания, планка и прочее своим весом.
    if (reps <= 0) {
      setError("Укажи количество повторений");
      return;
    }
    saveLock.current = true;
    setSyncing(true);
    setError(null);
    const saved: SavedSet = {
      exerciseId: exercise.id,
      setNumber,
      weightKg: weight,
      reps,
    };
    try {
      if (!api.isMock && sessionId) {
        const result = await api.saveSet(sessionId, saved);
        setQueuedCount((current) => (isQueued(result) ? current + 1 : current));
      }
      setSets((current) => [
        ...current.filter(
          (item) => !(item.exerciseId === saved.exerciseId && item.setNumber === saved.setNumber),
        ),
        saved,
      ]);
      haptic.success();
      if (setNumber < exercise.targetSets) {
        setSetNumber((current) => current + 1);
        setReps(Math.min(exercise.repMax, reps));
        startRest(restSeconds, exercise.name);
      } else {
        stopRest();
        setStage("exercise-result");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить подход");
    } finally {
      saveLock.current = false;
      setSyncing(false);
    }
  }

  function nextExercise() {
    haptic.tap();
    stopRest();
    if (exerciseIndex === exercises.length - 1) {
      setShowFinishConfirm(true);
      return;
    }
    const next = exercises[exerciseIndex + 1];
    setExerciseIndex((current) => current + 1);
    setSetNumber(1);
    setReps(next.repMax);
    setWeight(next.weightKg);
    setStage("active");
  }

  async function finishWorkout() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSyncing(true);
    setError(null);
    const finishedName = workout.name;
    try {
      if (!api.isMock && sessionId) {
        await api.completeWorkout(sessionId);
      }
      setShowFinishConfirm(false);
      setCompletedWorkoutName(finishedName);
      setCompletedDurationSeconds(elapsedSeconds);
      haptic.success();
      await onDataChanged();
      setStage("complete");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить тренировку");
    } finally {
      saveLock.current = false;
      setSyncing(false);
    }
  }

  function restart() {
    stopRest();
    setQueuedCount(0);
    setExerciseIndex(0);
    setSetNumber(1);
    setReps(exercises[0]?.repMax ?? 12);
    setWeight(exercises[0]?.weightKg ?? 0);
    setSets([]);
    setSessionId(null);
    setStartedAt(null);
    setElapsedSeconds(0);
    setCompletedWorkoutName(null);
    setStage("overview");
  }

  return (
    <div className="min-h-full">
      <AnimatePresence mode="wait">
        {stage === "overview" && (
          <motion.div key="overview" {...pageMotion} className="space-y-4">
            <Header eyebrow={`Цикл ${data.cycleNumber} · ${workout.position}/4`} title={workout.name} />
            <WorkoutPicker
              workouts={data.workoutTemplates}
              selectedTemplateId={workout.templateId}
              disabled={Boolean(data.activeSessionId)}
              onSelect={selectWorkout}
              onReorder={() => setOrderingCycle(true)}
            />
            {!data.activeSessionId && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setBuilder({ workout })}>
                  <Pencil size={16} /> Изменить
                </Button>
                <Button variant="secondary" onClick={() => setBuilder({ workout: null })}>
                  <Plus size={16} /> Своя тренировка
                </Button>
              </div>
            )}
            {data.activeSessionId && (
              <Card className="border-orange-300/15 bg-orange-300/[0.06] p-4">
                <p className="text-sm font-extrabold text-orange-200">Есть незавершённая тренировка</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  Можно продолжить её или сбросить, если это был тестовый запуск.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={start} disabled={syncing}>
                    Продолжить
                  </Button>
                  <Button variant="secondary" onClick={() => void cancelActiveWorkout()} disabled={syncing}>
                    Сбросить
                  </Button>
                </div>
                {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-200">{error}</p>}
              </Card>
            )}
            <Card className="overflow-hidden">
              <ExerciseImage imageKey={exercise.imageKey} alt={exercise.name} className="h-[250px]" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
                      Первое упражнение
                    </p>
                    <h2 className="mt-2 text-[25px] font-extrabold leading-tight tracking-[-0.04em]">
                      {exercise.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted">{exercise.muscles}</p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.06] px-3 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase text-muted">План</p>
                    <p className="mt-0.5 font-extrabold">
                      {exercise.targetSets}×{exercise.repMin}–{exercise.repMax}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <InfoPill label="Рабочий вес" value={`${exercise.weightKg} кг`} />
                  <InfoPill label="Прошлый раз" value={exercise.lastResult.replace(`${exercise.weightKg} кг · `, "")} />
                </div>
                <Button fullWidth className="mt-5" onClick={start} disabled={syncing}>
                  {syncing ? "Подготовка…" : "Начать"} <ArrowRight size={18} />
                </Button>
              </div>
            </Card>

            <section>
              <p className="mb-3 px-1 text-xs font-extrabold uppercase tracking-[0.14em] text-muted">
                План · {exercises.length} упражнений
              </p>
              <Card className="divide-y divide-white/[0.06] overflow-hidden">
                {exercises.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedExerciseInfo(item)}
                    className="flex w-full items-center gap-3 p-3 text-left"
                  >
                    <span className="w-5 text-center text-xs font-extrabold text-white/25">{index + 1}</span>
                    <ExerciseImage
                      imageKey={item.imageKey}
                      alt={item.name}
                      compact
                      className="h-12 w-12 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{item.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {item.weightKg} кг · {item.targetSets}×{item.repMin}–{item.repMax}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </button>
                ))}
              </Card>
            </section>
          </motion.div>
        )}

        {stage === "active" && (
          <motion.div key={`active-${exercise.id}-${setNumber}`} {...pageMotion} className="space-y-4">
            <div className="flex items-center justify-between">
              <button aria-label="Назад" onClick={() => setStage("overview")} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-muted">
                <ArrowLeft size={18} />
              </button>
              <div className="text-center">
                <p className="text-xs font-bold text-muted">Упражнение {exerciseIndex + 1} из {exercises.length}</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-semibold text-accent">
                  <Clock3 size={12} /> {formatElapsed(elapsedSeconds)}
                </p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-xs font-extrabold">
                {Math.round(((exerciseIndex + (setNumber - 1) / exercise.targetSets) / exercises.length) * 100)}%
              </div>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                animate={{ width: `${((exerciseIndex + (setNumber - 1) / exercise.targetSets) / exercises.length) * 100}%` }}
                className="h-full rounded-full bg-accent"
              />
            </div>

            <Card className="overflow-hidden">
              <ExerciseImage imageKey={exercise.imageKey} alt={exercise.name} className="h-[210px]" />
              <div className="p-5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">{exercise.muscles}</p>
                <h2 className="mt-1 text-[25px] font-extrabold tracking-[-0.04em]">{exercise.name}</h2>
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/[0.045] p-3">
                  <div>
                    <p className="text-[10px] font-semibold text-muted">Прошлый результат</p>
                    <p className="mt-1 text-xs font-extrabold">{exercise.lastResult}</p>
                  </div>
                  <Target size={20} className="text-accent" />
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted">Подход</p>
                  <p className="mt-0.5 text-xl font-extrabold">{setNumber} <span className="text-sm text-white/25">/ {exercise.targetSets}</span></p>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: exercise.targetSets }).map((_, index) => (
                    <span
                      key={index}
                      className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-extrabold ${index + 1 < setNumber ? "bg-accent text-ink" : index + 1 === setNumber ? "border border-accent text-accent" : "bg-white/[0.05] text-white/25"}`}
                    >
                      {index + 1 < setNumber ? <Check size={13} /> : index + 1}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted">
                    {weight > 0 ? "Вес, кг" : "Свой вес"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => setWeight((v) => Math.max(0, v - 2.5))} className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.06]"><Minus size={17} /></button>
                    <span className="min-w-[70px] text-center text-[27px] font-extrabold tracking-[-0.04em]">{weight}</span>
                    <button onClick={() => setWeight((v) => v + 2.5)} className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.06]"><Plus size={17} /></button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-muted">План сегодня</p>
                  <p className="mt-2 text-lg font-extrabold">{exercise.repMin}–{exercise.repMax} повт.</p>
                </div>
              </div>

              <p className="mt-6 text-xs font-semibold text-muted">Сколько повторений?</p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {[7, 8, 9, 10, 11, 12, 13, 14, 15].map((value) => (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    key={value}
                    onClick={() => { setReps(value); haptic.select(); }}
                    className={`h-11 rounded-xl text-sm font-extrabold ${reps === value ? "bg-accent text-ink" : "bg-white/[0.055] text-white/55"}`}
                  >
                    {value}
                  </motion.button>
                ))}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { setReps((v) => Math.max(16, v + 1)); haptic.select(); }}
                  className={`h-11 rounded-xl text-sm font-extrabold ${reps >= 16 ? "bg-accent text-ink" : "bg-white/[0.055] text-white/55"}`}
                >
                  {reps >= 16 ? reps : "15+"}
                </motion.button>
              </div>
              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">
                  {error}
                </p>
              )}
              <Button fullWidth className="mt-5" onClick={saveCurrentSet} disabled={syncing}>
                <CheckCircle2 size={18} /> {syncing ? "Сохраняю…" : "Подход выполнен"}
              </Button>
            </Card>
          </motion.div>
        )}

        {stage === "exercise-result" && (
          <motion.div key={`result-${exercise.id}`} {...pageMotion} className="space-y-4 pt-5">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent text-ink shadow-[0_0_40px_rgba(183,243,74,.22)]">
              <Check size={30} strokeWidth={3} />
            </div>
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Упражнение готово</p>
              <h2 className="mt-2 text-[28px] font-extrabold tracking-[-0.04em]">{exercise.name}</h2>
            </div>
            <Card className="p-5">
              <div className="grid grid-cols-3 gap-2">
                {currentExerciseSets.map((item) => (
                  <div key={item.setNumber} className="rounded-2xl bg-white/[0.05] p-3 text-center">
                    <p className="text-[10px] font-bold text-muted">ПОДХОД {item.setNumber}</p>
                    <p className="mt-2 text-xl font-extrabold">{item.reps}</p>
                    <p className="mt-1 text-[10px] text-white/35">
                      {item.weightKg > 0 ? `${item.weightKg} кг` : "свой вес"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-accent/10 bg-accent/[0.06] p-4">
                <Sparkles size={20} className="shrink-0 text-accent" />
                <div>
                  <p className="text-xs font-extrabold text-accent">FIT AI рекомендует</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">
                    {currentExerciseSets.every((item) => item.reps >= exercise.repMax)
                      ? `Отлично. В следующий раз попробуй ${exercise.weightKg + 2.5} кг.`
                      : "Сохрани вес и закрепи верх диапазона."}
                  </p>
                </div>
              </div>
            </Card>
            <Button fullWidth onClick={nextExercise} disabled={syncing}>
              {exerciseIndex === exercises.length - 1 ? "Завершить тренировку" : "Следующее упражнение"}
              <ArrowRight size={18} />
            </Button>
            <p className="text-center text-xs font-semibold text-muted">
              Выполнено {exerciseIndex + 1} из {exercises.length}
            </p>
          </motion.div>
        )}

        {stage === "complete" && (
          <motion.div key="complete" {...pageMotion} className="space-y-5 pt-6">
            <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-full border border-accent/20 bg-accent/[0.08] text-accent">
              <Trophy size={42} />
            </div>
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent">Тренировка завершена</p>
              <h1 className="mt-2 text-[34px] font-extrabold tracking-[-0.055em]">Сильная работа</h1>
              <p className="mt-2 text-sm text-muted">{completedWorkoutName ?? "Тренировка"} · Цикл {data.cycleNumber}</p>
            </div>
            <Card className="grid grid-cols-2 divide-x divide-white/[0.06] p-5 text-center">
              <ResultMetric label="Время" value={formatElapsed(completedDurationSeconds)} />
              <ResultMetric label="Подходы" value={`${sets.length}`} />
            </Card>
            <Card className="overflow-hidden bg-gradient-to-br from-[#1b2416] to-[#111411] p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-ink"><Dumbbell size={21} /></div>
                <div>
                  <p className="text-xs font-semibold text-muted">Следующая тренировка</p>
                  <p className="mt-0.5 text-xl font-extrabold">Выбери в списке</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-white/45">Цикл продвинут автоматически. Отдыхай столько, сколько нужно — календарной привязки нет.</p>
            </Card>
            <Button fullWidth onClick={restart}>Готово <Check size={18} /></Button>
            <button onClick={restart} className="mx-auto flex items-center gap-1.5 text-xs font-bold text-muted"><RotateCcw size={14} /> Посмотреть тренировку снова</button>
          </motion.div>
        )}
      </AnimatePresence>

      {queuedCount > 0 && (
        <p className="mt-4 rounded-2xl border border-orange-300/20 bg-orange-300/[0.08] px-4 py-3 text-center text-[11px] font-semibold text-orange-200">
          Нет сети — {queuedCount} подх. сохранены на телефоне и уйдут на сервер автоматически
        </p>
      )}

      <RestTimer
        endsAt={restEndsAt}
        duration={restSeconds}
        exerciseName={exercise.name}
        onDurationChange={(seconds) => {
          setRestSeconds(seconds);
          if (restEndsAt) startRest(seconds, exercise.name);
        }}
        onExtend={(seconds) => {
          const base = Math.max(Date.now(), restEndsAt ?? Date.now());
          const left = Math.round((base - Date.now()) / 1000) + seconds;
          startRest(left, exercise.name);
        }}
        onDismiss={stopRest}
      />

      <AnimatePresence>
        {orderingCycle && (
          <CycleOrderSheet
            workouts={data.workoutTemplates}
            onClose={() => setOrderingCycle(false)}
            onSaved={onDataChanged}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {builder && (
          <WorkoutBuilder
            workout={builder.workout}
            canDelete={data.workoutTemplates.length > 1}
            onClose={() => setBuilder(null)}
            onSaved={onDataChanged}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedExerciseInfo && (
          <ExerciseInfoModal
            exercise={selectedExerciseInfo}
            onClose={() => setSelectedExerciseInfo(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFinishConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
          >
            <motion.div
              initial={{ y: 28 }}
              animate={{ y: 0 }}
              exit={{ y: 28 }}
              className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-[#171a17] p-5 shadow-2xl"
            >
              <h2 id="finish-title" className="text-xl font-extrabold">Завершить тренировку?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">Подходы сохранятся, цикл перейдёт к следующей тренировке, а тренеру уйдёт отчёт.</p>
              {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-200">{error}</p>}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setShowFinishConfirm(false)} disabled={syncing}>Продолжить</Button>
                <Button onClick={() => void finishWorkout()} disabled={syncing}>{syncing ? "Завершаю…" : "Завершить"}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22 },
};

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="px-1 pt-1">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-accent">{eyebrow}</p>
      <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.05em]">{title}</h1>
    </header>
  );
}

function WorkoutPicker({
  workouts,
  selectedTemplateId,
  disabled,
  onSelect,
  onReorder,
}: {
  workouts: WorkoutPlan[];
  selectedTemplateId: number;
  disabled: boolean;
  onSelect: (templateId: number) => void;
  onReorder?: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted">
          Выбери тренировку
        </p>
        {workouts.length > 1 && onReorder && (
          <button
            type="button"
            onClick={onReorder}
            disabled={disabled}
            className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-accent disabled:opacity-40"
          >
            Порядок
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {workouts.map((item) => (
          <button
            key={item.templateId}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(item.templateId)}
            className={`rounded-2xl border px-3 py-3 text-left transition disabled:opacity-50 ${
              item.templateId === selectedTemplateId
                ? "border-accent/45 bg-accent/10 text-white"
                : "border-white/[0.07] bg-white/[0.035] text-white/60"
            }`}
          >
            <span className="text-sm font-extrabold">{item.name}</span>
            <span className="mt-1 block text-[10px] font-semibold text-muted">
              {item.exercises.length} упражнений{item.isNext ? " · следующая" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ExerciseInfoModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ y: 28 }}
        animate={{ y: 0 }}
        exit={{ y: 28 }}
        className="mx-auto w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-[#171a17] shadow-2xl"
      >
        <ExerciseImage imageKey={exercise.imageKey} alt={exercise.name} className="h-56" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">{exercise.muscles}</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.04em]">{exercise.name}</h2>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted">
              <X size={18} />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <InfoPill label="План" value={`${exercise.targetSets}×${exercise.repMin}–${exercise.repMax}`} />
            <InfoPill label="Вес" value={`${exercise.weightKg} кг`} />
            <div className="col-span-2">
              <InfoPill label="Прошлый результат" value={exercise.lastResult} />
            </div>
          </div>
          <Button fullWidth className="mt-5" onClick={onClose}>Понятно</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.045] p-3">
      <p className="text-[10px] font-semibold text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold">{value}</p>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl font-extrabold tracking-[-0.03em]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-muted">{label}</p>
    </div>
  );
}

function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
