import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../components/Button";
import { pairDevice } from "../services/auth";
import { isNative, vibrate } from "../services/native";

const CODE_LENGTH = 8;
const BOT_URL = "https://t.me/vladfilaibot";

/** Первый запуск APK: код из бота меняется на постоянный токен устройства. */
export function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = code.length === CODE_LENGTH;

  function handleChange(raw: string) {
    const cleaned = raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, CODE_LENGTH);
    setCode(cleaned);
    setError(null);
    if (cleaned.length > code.length) vibrate.select();
  }

  async function submit() {
    if (!filled || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pairDevice(code, deviceName());
      vibrate.success();
      onPaired();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось привязать устройство");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center bg-app px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <img
          src="/logo.jpg"
          alt="FIT AI"
          className="mx-auto h-24 w-24 rounded-[26px] shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        />
        <h1 className="mt-7 text-center text-[28px] font-extrabold tracking-[-0.05em]">
          Привяжи устройство
        </h1>
        <p className="mx-auto mt-3 max-w-[320px] text-center text-sm leading-relaxed text-muted">
          Отправь боту команду <span className="font-bold text-white/75">/app</span> и введи код,
          который он пришлёт.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="mt-8 flex w-full justify-center gap-1.5"
          aria-label="Ввести код привязки"
        >
          {Array.from({ length: CODE_LENGTH }).map((_, index) => (
            <span
              key={index}
              className={`grid h-12 w-[11%] min-w-[30px] place-items-center rounded-xl border text-lg font-extrabold transition ${
                code[index]
                  ? "border-accent/40 bg-accent/10 text-white"
                  : index === code.length
                    ? "border-accent/40 bg-white/[0.04] text-white"
                    : "border-white/[0.08] bg-white/[0.03] text-white/20"
              }`}
            >
              {code[index] ?? "·"}
            </span>
          ))}
        </button>

        <input
          ref={inputRef}
          value={code}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void submit()}
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          aria-label="Код привязки"
          className="sr-only"
        />

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-center text-xs font-semibold text-red-200"
          >
            {error}
          </p>
        )}

        <Button fullWidth className="mt-7" onClick={() => void submit()} disabled={!filled || busy}>
          {busy ? "Проверяю…" : "Войти"} <ArrowRight size={18} />
        </Button>

        {!isNative && (
          <p className="mt-4 text-center text-[11px] text-white/30">
            Открой{" "}
            <a href={BOT_URL} target="_blank" rel="noreferrer" className="text-accent underline">
              бота в Telegram
            </a>{" "}
            и отправь /app
          </p>
        )}

        <p className="mt-8 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25">
          <ShieldCheck size={12} /> Код одноразовый и живёт 10 минут
        </p>
      </motion.div>
    </div>
  );
}

function deviceName(): string {
  const match = navigator.userAgent.match(/Android[^;]*;\s*([^)]+?)(?:\s+Build|\))/);
  return match?.[1]?.trim() || (isNative ? "Android" : "Браузер");
}
