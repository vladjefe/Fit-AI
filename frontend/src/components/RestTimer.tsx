import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  cancelRestNotification,
  formatRest,
  REST_PRESETS,
  restFinishedFeedback,
  saveRestDuration,
} from "../services/restTimer";

interface RestTimerProps {
  /** Момент окончания в epoch ms, null — таймер не запущен. */
  endsAt: number | null;
  duration: number;
  exerciseName: string;
  onDurationChange: (seconds: number) => void;
  onDismiss: () => void;
  onExtend: (seconds: number) => void;
}

/**
 * Отсчёт ведётся от абсолютного времени окончания, а не тиками интервала:
 * после сворачивания приложения таймер показывает верное значение.
 */
export function RestTimer({
  endsAt,
  duration,
  exerciseName,
  onDurationChange,
  onDismiss,
  onExtend,
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(0);
      firedRef.current = false;
      return;
    }
    firedRef.current = false;
    const tick = () => {
      const left = (endsAt - Date.now()) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        restFinishedFeedback();
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  const active = Boolean(endsAt);
  const progress = active && duration > 0 ? Math.min(1, remaining / duration) : 0;
  const done = active && remaining <= 0;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed inset-x-0 bottom-0 z-[55] mx-auto max-w-[520px] px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          role="status"
          aria-live="polite"
        >
          <div
            className={`overflow-hidden rounded-[24px] border shadow-2xl backdrop-blur-xl ${
              done
                ? "border-accent/40 bg-accent/[0.14]"
                : "border-white/10 bg-[#141715]/95"
            }`}
          >
            <div className="h-1 bg-white/[0.06]">
              <motion.div
                className="h-full bg-accent"
                animate={{ width: `${progress * 100}%` }}
                transition={{ ease: "linear", duration: 0.25 }}
              />
            </div>
            <div className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted">
                  {done ? "Отдых закончен" : "Отдых"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-white/45">{exerciseName}</p>
              </div>
              <span
                className={`tabular-nums text-[30px] font-extrabold leading-none tracking-[-0.05em] ${done ? "text-accent" : ""}`}
              >
                {formatRest(remaining)}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onExtend(30)}
                  aria-label="Добавить 30 секунд"
                  className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.07] text-[10px] font-extrabold"
                >
                  <Plus size={13} />
                  30
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void cancelRestNotification();
                    onDismiss();
                  }}
                  aria-label="Закрыть таймер"
                  className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.07]"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {!done && (
              <div className="flex gap-1.5 border-t border-white/[0.06] px-3.5 py-2.5">
                {REST_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onDurationChange(preset);
                      void saveRestDuration(preset);
                    }}
                    className={`h-8 flex-1 rounded-lg text-[11px] font-extrabold transition ${
                      duration === preset
                        ? "bg-accent text-ink"
                        : "bg-white/[0.05] text-white/45"
                    }`}
                  >
                    {formatRest(preset)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
