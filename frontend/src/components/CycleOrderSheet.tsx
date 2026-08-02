import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";
import { api } from "../services/api";
import { vibrate } from "../services/native";
import type { WorkoutPlan } from "../types";

interface CycleOrderSheetProps {
  workouts: WorkoutPlan[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Порядок тренировок определяет, какая идёт следующей после завершённой.
 * Редкое действие, поэтому живёт отдельной шторкой, а не стрелками на карточках.
 */
export function CycleOrderSheet({ workouts, onClose, onSaved }: CycleOrderSheetProps) {
  const [order, setOrder] = useState<WorkoutPlan[]>(workouts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    vibrate.select();
    setOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.reorderWorkoutTemplates(order.map((item) => item.templateId));
      vibrate.success();
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить порядок");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[75] flex items-end bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cycle-order-title"
    >
      <motion.div
        initial={{ y: 32 }}
        animate={{ y: 0 }}
        exit={{ y: 32 }}
        className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-[#171a17] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cycle-order-title" className="text-xl font-extrabold">
              Порядок цикла
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              В этом порядке тренировки идут одна за другой. После последней цикл
              начинается заново.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          {order.map((item, index) => (
            <div
              key={item.templateId}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2.5"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-extrabold text-accent">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{item.name}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {item.exercises.length} упражнений
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`${item.name}: выше`}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-white/50 disabled:opacity-25"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  aria-label={`${item.name}: ниже`}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-white/50 disabled:opacity-25"
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200"
          >
            {error}
          </p>
        )}

        <Button fullWidth className="mt-5" onClick={() => void save()} disabled={saving}>
          <Check size={18} /> {saving ? "Сохраняю…" : "Сохранить порядок"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
