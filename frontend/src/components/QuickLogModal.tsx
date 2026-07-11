import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Utensils, Weight } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../services/api";
import { Button } from "./Button";

export type QuickLogKind = "weight" | "nutrition";

interface QuickLogModalProps {
  kind: QuickLogKind | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const copy = {
  weight: { title: "Записать вес", icon: Weight },
  nutrition: { title: "Записать питание", icon: Utensils },
};

export function QuickLogModal({ kind, onClose, onSaved }: QuickLogModalProps) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) return;

    const updateVisibleHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      const top = window.visualViewport?.offsetTop ?? 0;
      document.documentElement.style.setProperty("--fit-ai-visible-height", `${height}px`);
      document.documentElement.style.setProperty("--fit-ai-visible-top", `${top}px`);
    };

    updateVisibleHeight();
    window.visualViewport?.addEventListener("resize", updateVisibleHeight);
    window.visualViewport?.addEventListener("scroll", updateVisibleHeight);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateVisibleHeight);
      window.visualViewport?.removeEventListener("scroll", updateVisibleHeight);
      document.documentElement.style.removeProperty("--fit-ai-visible-height");
      document.documentElement.style.removeProperty("--fit-ai-visible-top");
    };
  }, [kind]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!kind || saving) return;
    const a = Number(first.replace(",", "."));
    const b = Number(second.replace(",", "."));
    if (!Number.isFinite(a) || a <= 0 || (kind === "nutrition" && (!Number.isFinite(b) || b <= 0))) {
      setError("Заполни поля положительными числами");
      return;
    }
    if (kind === "weight" && (a <= 20 || a >= 500)) {
      setError("Вес должен быть от 20 до 500 кг");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (kind === "weight") await api.addWeight(a);
      if (kind === "nutrition") await api.addNutrition(Math.round(a), b);
      onSaved(`${copy[kind].title.replace("Записать", "Записано")}`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить запись");
    } finally {
      setSaving(false);
    }
  }

  const Icon = kind ? copy[kind].icon : Weight;
  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          className="fixed inset-x-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
          style={{
            top: "var(--fit-ai-visible-top, 0px)",
            height: "var(--fit-ai-visible-height, 100dvh)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-log-title"
        >
          <motion.form
            onSubmit={submit}
            initial={{ y: 24 }}
            animate={{ y: 0 }}
            exit={{ y: 24 }}
            className="mx-auto flex max-h-[calc(var(--fit-ai-visible-height)-24px)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#171a17] shadow-2xl"
          >
            <div className="flex shrink-0 items-center gap-3 p-5 pb-3">
              <button type="button" aria-label="Назад" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-muted">
                <ArrowLeft size={18} />
              </button>
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Icon size={19} /></div>
              <h2 id="quick-log-title" className="text-xl font-extrabold">{copy[kind].title}</h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field
                label={kind === "weight" ? "Вес, кг" : "Калории"}
                value={first}
                onChange={setFirst}
                placeholder={kind === "weight" ? "84.6" : "2300"}
                className={kind === "weight" ? "col-span-2" : ""}
              />
              {kind !== "weight" && (
                <Field
                  label="Белок, г"
                  value={second}
                  onChange={setSecond}
                  placeholder="160"
                />
              )}
            </div>
            {error && <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">{error}</p>}
            </div>
            <div className="shrink-0 border-t border-white/[0.06] bg-[#171a17] p-4">
            <Button type="submit" fullWidth disabled={saving}>
              <Check size={18} /> {saving ? "Ввожу…" : "Ввести"}
            </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, value, onChange, placeholder, className = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={className}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-13 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-lg font-extrabold outline-none transition placeholder:text-white/20 focus:border-accent/50"
      />
    </label>
  );
}
