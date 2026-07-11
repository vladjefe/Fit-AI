import { Dumbbell } from "lucide-react";
import { useState } from "react";

interface ExerciseImageProps {
  imageKey: string;
  alt: string;
  className?: string;
  compact?: boolean;
}

export function ExerciseImage({
  imageKey,
  alt,
  className = "",
  compact = false,
}: ExerciseImageProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative isolate overflow-hidden bg-[#171b18] ${className}`}
      aria-label={failed ? `Иллюстрация упражнения: ${alt}` : undefined}
    >
      {!failed ? (
        <img
          src={`/assets/exercises/${imageKey}.png`}
          alt={alt}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="absolute -right-6 -top-10 h-36 w-36 rounded-full bg-accent/10 blur-2xl" />
          <div className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-sky-400/10 blur-2xl" />
          <div className="absolute inset-x-5 bottom-4 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div
            className={`flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-accent ${compact ? "h-11 w-11" : "h-20 w-20"}`}
          >
            <Dumbbell size={compact ? 21 : 36} strokeWidth={1.7} />
          </div>
          {!compact && (
            <span className="absolute bottom-7 text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">
              FIT AI movement
            </span>
          )}
        </div>
      )}
    </div>
  );
}
