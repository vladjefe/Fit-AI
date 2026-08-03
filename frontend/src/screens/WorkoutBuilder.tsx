import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ExerciseImage } from "../components/ExerciseImage";
import { api } from "../services/api";
import { vibrate } from "../services/native";
import { EQUIPMENT_TYPES, MUSCLE_GROUPS } from "../types";
import type { BuilderExercise, CatalogExercise, WorkoutPlan } from "../types";

interface WorkoutBuilderProps {
  /** null — создаём новую тренировку. */
  workout: WorkoutPlan | null;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export function WorkoutBuilder({ workout, canDelete, onClose, onSaved }: WorkoutBuilderProps) {
  const [name, setName] = useState(workout?.name ?? "");
  const [items, setItems] = useState<BuilderExercise[]>(() =>
    (workout?.exercises ?? []).map((item) => ({
      exerciseId: item.id,
      name: item.name,
      imageKey: item.imageKey,
      muscleGroup: item.muscles,
      targetSets: item.targetSets,
      repMin: item.repMin,
      repMax: item.repMax,
      weightKg: item.weightKg,
    })),
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const valid = name.trim().length > 0 && items.length > 0;

  function patch(index: number, changes: Partial<BuilderExercise>) {
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, ...changes } : item)),
    );
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    vibrate.select();
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function add(exercise: CatalogExercise) {
    // Повторное упражнение в одной тренировке — почти всегда промах, а не замысел.
    if (items.some((item) => item.exerciseId === exercise.id)) {
      setPicking(false);
      return;
    }
    vibrate.success();
    setItems((current) => [
      ...current,
      {
        exerciseId: exercise.id,
        name: exercise.name,
        imageKey: exercise.imageKey,
        muscleGroup: exercise.muscleGroup,
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        weightKg: 0,
      },
    ]);
    setPicking(false);
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveWorkoutTemplate(workout?.templateId ?? null, name.trim(), items);
      vibrate.success();
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!workout || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteWorkoutTemplate(workout.templateId);
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="fixed inset-0 z-[80] overflow-y-auto bg-app"
    >
      <div className="mx-auto min-h-full max-w-[520px] px-4 pb-32 pt-[max(12px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-muted"
          >
            <X size={18} />
          </button>
          <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-accent">
            {workout ? "Правка тренировки" : "Новая тренировка"}
          </p>
          <div className="h-10 w-10" />
        </header>

        <input
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 100))}
          placeholder="Название, например «Ноги 1»"
          aria-label="Название тренировки"
          className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-lg font-extrabold tracking-[-0.02em] placeholder:font-bold placeholder:text-white/25"
        />

        <div className="mt-5 flex items-baseline justify-between px-1">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">
            Упражнения · {items.length}
          </p>
          {items.length > 0 && (
            <p className="text-[11px] text-white/30">~{Math.max(30, items.length * 10)} мин</p>
          )}
        </div>

        {items.length === 0 ? (
          <Card className="mt-3 p-8 text-center">
            <p className="text-sm font-bold text-white/50">Пока пусто</p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/30">
              Добавь упражнения из каталога — потом настроишь подходы и вес.
            </p>
          </Card>
        ) : (
          <div className="mt-3 space-y-2">
            {items.map((item, index) => (
              <BuilderRow
                key={`${item.exerciseId}-${index}`}
                item={item}
                index={index}
                total={items.length}
                onMove={move}
                onPatch={patch}
                onRemove={() =>
                  setItems((current) => current.filter((_, position) => position !== index))
                }
              />
            ))}
          </div>
        )}

        <Button variant="secondary" fullWidth className="mt-3" onClick={() => setPicking(true)}>
          <Plus size={18} /> Добавить упражнение
        </Button>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold text-red-200"
          >
            {error}
          </p>
        )}

        {workout && canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mx-auto mt-6 flex items-center gap-1.5 text-xs font-bold text-red-300/70"
          >
            <Trash2 size={14} /> Удалить тренировку
          </button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[81] mx-auto max-w-[520px] border-t border-white/[0.07] bg-[#0b0d0c]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl">
        <Button fullWidth onClick={() => void save()} disabled={!valid || saving}>
          <Check size={18} /> {saving ? "Сохраняю…" : "Сохранить"}
        </Button>
      </div>

      <AnimatePresence>
        {picking && (
          <CatalogPicker
            chosenIds={items.map((item) => item.exerciseId)}
            onPick={add}
            onClose={() => setPicking(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-[#171a17] p-5">
              <h2 className="text-xl font-extrabold">Удалить «{workout?.name}»?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Тренировка исчезнет из цикла. Проведённые по ней сессии и история останутся.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={saving}>
                  Отмена
                </Button>
                <Button onClick={() => void remove()} disabled={saving}>
                  {saving ? "Удаляю…" : "Удалить"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BuilderRow({
  item,
  index,
  total,
  onMove,
  onPatch,
  onRemove,
}: {
  item: BuilderExercise;
  index: number;
  total: number;
  onMove: (index: number, delta: number) => void;
  onPatch: (index: number, changes: Partial<BuilderExercise>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <ExerciseImage
          imageKey={item.imageKey ?? "placeholder"}
          alt={item.name}
          compact
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-bold">{item.name}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {item.targetSets}×{item.repMin}–{item.repMax}
            {item.weightKg > 0 ? ` · ${item.weightKg} кг` : ""}
          </p>
        </button>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="Выше"
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-white/50 disabled:opacity-25"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            aria-label="Ниже"
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-white/50 disabled:opacity-25"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Убрать ${item.name}`}
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-red-300/70"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/[0.06] p-3">
          <Stepper
            label="Подходы"
            value={item.targetSets}
            onChange={(value) => onPatch(index, { targetSets: clamp(value, 1, 12) })}
          />
          <Stepper
            label="Повторы от"
            value={item.repMin}
            onChange={(value) =>
              onPatch(index, {
                repMin: clamp(value, 1, 100),
                repMax: Math.max(item.repMax, clamp(value, 1, 100)),
              })
            }
          />
          <Stepper
            label="Повторы до"
            value={item.repMax}
            onChange={(value) => onPatch(index, { repMax: clamp(value, item.repMin, 100) })}
          />
          <Stepper
            label="Рабочий вес, кг"
            value={item.weightKg}
            step={2.5}
            onChange={(value) => onPatch(index, { weightKg: clamp(value, 0, 2000) })}
          />
        </div>
      )}
    </Card>
  );
}

function Stepper({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - step)}
          aria-label={`${label}: меньше`}
          className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.06]"
        >
          <Minus size={15} />
        </button>
        <span className="min-w-[52px] text-center text-base font-extrabold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + step)}
          aria-label={`${label}: больше`}
          className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.06]"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function CatalogPicker({
  chosenIds,
  onPick,
  onClose,
}: {
  chosenIds: number[];
  onPick: (exercise: CatalogExercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [all, setAll] = useState<CatalogExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftGroup, setDraftGroup] = useState<string>(MUSCLE_GROUPS[0]);
  const [draftEquipment, setDraftEquipment] = useState<string>(EQUIPMENT_TYPES[0]);
  const [savingDraft, setSavingDraft] = useState(false);

  async function createAndPick() {
    const name = query.trim();
    if (!name || savingDraft) return;
    setSavingDraft(true);
    setError(null);
    try {
      const created = await api.createCustomExercise({
        name,
        muscleGroup: draftGroup,
        equipment: draftEquipment,
      });
      setAll((current) => (current ? [...current, created] : [created]));
      onPick(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить упражнение");
      setSavingDraft(false);
    }
  }

  useEffect(() => {
    let active = true;
    api
      .exerciseCatalog()
      .then((rows) => active && setAll(rows))
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Каталог недоступен");
      });
    return () => {
      active = false;
    };
  }, []);

  // Фильтруем локально: каталог небольшой, запрос на каждую букву не нужен.
  const visible = useMemo(() => {
    if (!all) return [];
    const needle = query.trim().toLowerCase();
    return all.filter(
      (item) =>
        (!group || item.muscleGroup === group) &&
        (!needle || item.name.toLowerCase().includes(needle)),
    );
  }, [all, query, group]);

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 340, damping: 34 }}
      className="fixed inset-0 z-[85] flex flex-col bg-[#0d100e]"
      role="dialog"
      aria-modal="true"
      aria-label="Каталог упражнений"
    >
      <div className="mx-auto w-full max-w-[520px] px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 py-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск упражнения"
              aria-label="Поиск упражнения"
              autoFocus
              className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] py-3 pl-9 pr-3 text-sm font-semibold placeholder:text-white/25"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть каталог"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
          <Chip active={group === null} onClick={() => setGroup(null)}>
            Все
          </Chip>
          {MUSCLE_GROUPS.map((item) => (
            <Chip key={item} active={group === item} onClick={() => setGroup(item)}>
              {item}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[520px] flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {error && (
          <p role="alert" className="py-8 text-center text-sm font-semibold text-red-200">
            {error}
          </p>
        )}
        {!error && all === null && (
          <p className="py-8 text-center text-sm text-muted">Загружаю каталог…</p>
        )}
        {all !== null && visible.length === 0 && !creating && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted">Такого упражнения в каталоге нет.</p>
            {query.trim() ? (
              <Button variant="secondary" className="mt-4" onClick={() => setCreating(true)}>
                <Plus size={16} /> Добавить «{query.trim()}»
              </Button>
            ) : (
              <p className="mt-1.5 text-xs text-white/30">Начни вводить название.</p>
            )}
          </div>
        )}

        {creating && (
          <div className="rounded-2xl border border-accent/20 bg-accent/[0.05] p-4">
            <p className="text-sm font-extrabold">Своё упражнение</p>
            <p className="mt-1 text-xs text-white/45">«{query.trim()}»</p>

            <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
              Группа мышц
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MUSCLE_GROUPS.map((item) => (
                <Chip key={item} active={draftGroup === item} onClick={() => setDraftGroup(item)}>
                  {item}
                </Chip>
              ))}
            </div>

            <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
              Оборудование
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EQUIPMENT_TYPES.map((item) => (
                <Chip
                  key={item}
                  active={draftEquipment === item}
                  onClick={() => setDraftEquipment(item)}
                >
                  {item}
                </Chip>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={savingDraft}>
                Отмена
              </Button>
              <Button onClick={() => void createAndPick()} disabled={savingDraft}>
                {savingDraft ? "Добавляю…" : "Добавить"}
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          {visible.map((item) => {
            const chosen = chosenIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item)}
                disabled={chosen}
                className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                  chosen
                    ? "border-accent/25 bg-accent/[0.07] opacity-60"
                    : "border-white/[0.06] bg-white/[0.03]"
                }`}
              >
                <ExerciseImage
                  imageKey={item.imageKey ?? "placeholder"}
                  alt={item.name}
                  equipment={item.equipment}
                  compact
                  className="h-11 w-11 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {item.muscleGroup} · {item.equipment}
                  </p>
                </div>
                {chosen ? (
                  <Check size={16} className="shrink-0 text-accent" />
                ) : (
                  <Plus size={16} className="shrink-0 text-white/30" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-extrabold transition ${
        active ? "bg-accent text-ink" : "bg-white/[0.055] text-white/50"
      }`}
    >
      {children}
    </button>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
