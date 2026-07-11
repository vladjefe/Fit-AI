import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Dumbbell,
  Footprints,
  ImagePlus,
  Target,
  Trophy,
  Weight,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ProgressRing } from "../components/ProgressRing";
import { api } from "../services/api";
import type { GoalData, ProgressPhotoData } from "../types";

export function GoalsScreen({ onToast }: { onToast: (message: string) => void }) {
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [photos, setPhotos] = useState<ProgressPhotoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GoalData | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [goalRows, photoRows] = await Promise.all([api.goals(), api.progressPhotos()]);
      setGoals(goalRows);
      setPhotos(photoRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить цели");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    Promise.all(
      photos.slice(0, 2).map(async (photo) => {
        const url = await api.progressPhotoUrl(photo.id);
        urls.push(url);
        return [photo.id, url] as const;
      }),
    )
      .then((entries) => {
        if (active) setPhotoUrls(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setPhotoUrls({});
      });
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  const averageProgress = useMemo(() => {
    if (!goals.length) return 0;
    return Math.round(goals.reduce((sum, goal) => sum + progressFor(goal), 0) / goals.length);
  }, [goals]);

  async function uploadPhoto(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const saved = await api.uploadProgressPhoto(file);
      setPhotos((current) => [saved, ...current]);
      onToast("Фото формы сохранено приватно");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-20 animate-pulse rounded-[22px] bg-white/[0.05]" />
        <div className="h-36 animate-pulse rounded-[22px] bg-white/[0.05]" />
        <div className="h-80 animate-pulse rounded-[22px] bg-white/[0.05]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="px-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Куда идем</p>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-[30px] font-extrabold tracking-[-0.05em]">Цели</h1>
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-accent text-ink"
            onClick={() => setCreating(true)}
            aria-label="Создать цель"
          >
            <Target size={19} />
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold text-red-200">
          {error}
        </p>
      )}

      <Card className="overflow-hidden bg-gradient-to-br from-[#1c2417] to-[#111411] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted">Общий прогресс</p>
            <p className="mt-1 text-[28px] font-extrabold tracking-[-0.045em]">
              {averageProgress >= 70 ? "На верном пути" : "Двигаемся"}
            </p>
            <p className="mt-2 text-xs text-white/45">{goals.length} активные цели</p>
          </div>
          <ProgressRing value={averageProgress} size={74} strokeWidth={7} />
        </div>
      </Card>

      {goals.length ? (
        <div className="space-y-3">
          {goals.map((goal, index) => (
            <GoalCard key={goal.id} goal={goal} index={index} onEdit={() => setEditing(goal)} />
          ))}
        </div>
      ) : (
        <EmptyState title="Целей пока нет" description="Seed должен создать стартовые цели. Если их нет — обнови данные." />
      )}

      <Card className="overflow-hidden">
        <div className="relative h-44 overflow-hidden bg-[#171a18]">
          {photos.length > 0 && (
            <div className={`absolute inset-0 z-10 grid gap-px bg-black ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {photos.slice(0, 2).map((photo, index) => (
                <div key={photo.id} className="relative overflow-hidden bg-white/[0.04]">
                  {photoUrls[photo.id] ? (
                    <img
                      src={photoUrls[photo.id]}
                      alt={index === 0 ? "Последнее фото формы" : "Предыдущее фото формы"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-white/[0.05]" />
                  )}
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold text-white">
                    {index === 0 ? "Сейчас" : formatPhotoDate(photo.takenAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-violet-400/[0.08] blur-3xl" />
          <div className="absolute -right-8 bottom-0 h-36 w-36 rounded-full bg-accent/[0.08] blur-3xl" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/45"><Camera size={25} /></div>
              <p className="mt-3 text-sm font-extrabold">Фото формы</p>
              <p className="mt-1 text-[11px] text-muted">
                {photos.length ? `Сохранено фото: ${photos.length}` : "Пока нет фото"}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void uploadPhoto(event.target.files?.[0])}
          />
          <Button
            variant="secondary"
            fullWidth
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <ImagePlus size={18} /> {uploading ? "Загружаю…" : "Добавить фото"}
          </Button>
          <p className="mt-3 text-center text-[10px] leading-relaxed text-white/30">
            Фото приватны, не отправляются тренеру и не используются в AI-анализе.
          </p>
        </div>
      </Card>

      <AnimatePresence>
        {creating && (
          <CreateGoalModal
            onClose={() => setCreating(false)}
            onSaved={(goal) => {
              setGoals((current) => [goal, ...current]);
              setCreating(false);
              onToast("Цель создана");
            }}
          />
        )}
        {editing && (
          <GoalEditModal
            goal={editing}
            onClose={() => setEditing(null)}
            onSaved={(goal) => {
              setGoals((current) => current.map((item) => (item.id === goal.id ? goal : item)));
              setEditing(null);
              onToast("Цель обновлена");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function formatPhotoDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Ранее";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(parsed);
}

function GoalCard({ goal, index, onEdit }: { goal: GoalData; index: number; onEdit: () => void }) {
  const Icon = iconFor(goal.type);
  const progress = progressFor(goal);
  return (
    <motion.button
      type="button"
      onClick={onEdit}
      className="block w-full text-left"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneFor(goal.type)}`}><Icon size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold">{goal.title}</p>
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-bold text-muted">Изменить</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-xl font-extrabold tracking-[-0.03em]">{formatGoalValue(goal, goal.currentValue)}</p>
              <p className="text-[11px] font-semibold text-muted">из {formatGoalValue(goal, goal.targetValue)}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.7, delay: 0.1 + index * 0.06 }} className="h-full rounded-full bg-accent" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] font-semibold">
          <span className="text-muted">{goalHint(goal)}</span>
          <span className="text-white/50">{progress}%</span>
        </div>
      </Card>
    </motion.button>
  );
}

function CreateGoalModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (goal: GoalData) => void;
}) {
  const [title, setTitle] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Название цели не может быть пустым");
      return;
    }
    const current = currentValue.trim() ? parseNumber(currentValue) : null;
    const target = targetValue.trim() ? parseNumber(targetValue) : null;
    if ((currentValue.trim() && current === null) || (targetValue.trim() && target === null)) {
      setError("Проверь числовые значения");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.createGoal({
        title: cleanTitle,
        currentValue: current,
        targetValue: target,
        unit: unit.trim() || null,
      });
      onSaved(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать цель");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.form
        onSubmit={submit}
        initial={{ y: 28 }}
        animate={{ y: 0 }}
        exit={{ y: 28 }}
        className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-[#171a17] p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Новая цель</p>
            <h2 className="mt-1 text-xl font-extrabold">Что фиксируем?</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-muted">Название</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например: Талия" className="mt-2 h-13 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-lg font-extrabold outline-none focus:border-accent/50" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-xs font-semibold text-muted">Сейчас</span>
              <input inputMode="decimal" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} className="mt-2 h-13 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-lg font-extrabold outline-none focus:border-accent/50" />
            </label>
            <label>
              <span className="text-xs font-semibold text-muted">Цель</span>
              <input inputMode="decimal" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="mt-2 h-13 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-lg font-extrabold outline-none focus:border-accent/50" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted">Единица</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="кг, см, раз…" className="mt-2 h-13 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-lg font-extrabold outline-none focus:border-accent/50" />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">{error}</p>}
        <Button type="submit" fullWidth className="mt-5" disabled={saving}>
          {saving ? "Создаю…" : "Создать цель"}
        </Button>
      </motion.form>
    </motion.div>
  );
}

function GoalEditModal({ goal, onClose, onSaved }: { goal: GoalData; onClose: () => void; onSaved: (goal: GoalData) => void }) {
  const [currentValue, setCurrentValue] = useState(goal.currentValue?.toString() ?? "");
  const [targetValue, setTargetValue] = useState(goal.targetValue?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = parseNumber(currentValue);
    const target = parseNumber(targetValue);
    if (current === null || target === null) {
      setError("Заполни текущий и целевой показатель числами");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateGoal(goal.id, { currentValue: current, targetValue: target });
      onSaved(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить цель");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.form
        onSubmit={submit}
        initial={{ y: 28 }}
        animate={{ y: 0 }}
        exit={{ y: 28 }}
        className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-[#171a17] p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Редактировать цель</p>
            <h2 className="mt-1 text-xl font-extrabold">{goal.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label>
            <span className="text-xs font-semibold text-muted">Сейчас</span>
            <input inputMode="decimal" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} className="mt-2 h-13 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-lg font-extrabold outline-none focus:border-accent/50" />
          </label>
          <label>
            <span className="text-xs font-semibold text-muted">Цель</span>
            <input inputMode="decimal" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="mt-2 h-13 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-lg font-extrabold outline-none focus:border-accent/50" />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">{error}</p>}
        <Button type="submit" fullWidth className="mt-5" disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </Button>
      </motion.form>
    </motion.div>
  );
}

function iconFor(type: string) {
  if (type === "weight") return Weight;
  if (type === "pull_ups") return Trophy;
  if (type === "bench_press") return Dumbbell;
  if (type === "cardio_5k") return Footprints;
  return Target;
}

function toneFor(type: string): string {
  if (type === "weight") return "text-sky-300 bg-sky-400/10";
  if (type === "pull_ups") return "text-violet-300 bg-violet-400/10";
  if (type === "bench_press") return "text-accent bg-accent/10";
  if (type === "cardio_5k") return "text-orange-300 bg-orange-400/10";
  return "text-white/60 bg-white/[0.05]";
}

function progressFor(goal: GoalData): number {
  const current = goal.currentValue;
  const target = goal.targetValue;
  if (!current || !target) return 0;
  const value = goal.type === "weight" || goal.type === "cardio_5k" ? target / current : current / target;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function formatGoalValue(goal: GoalData, value: number | null): string {
  if (value === null) return "—";
  if (goal.unit === "сек.") return formatSeconds(value);
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return goal.unit ? `${formatted} ${goal.unit}` : formatted;
}

function goalHint(goal: GoalData): string {
  if (goal.type === "weight" && goal.currentValue && goal.targetValue) {
    return `Осталось ${Math.max(0, goal.currentValue - goal.targetValue).toFixed(1)} кг`;
  }
  if (goal.type === "cardio_5k") return "Чем меньше время — тем лучше";
  return "Нажми, чтобы обновить";
}

function formatSeconds(value: number): string {
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
