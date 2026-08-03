import { Award, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { ExerciseHistory } from "../types";

/**
 * График рисуется вручную: recharts живёт в отдельном чанке экрана прогресса
 * (~390 КБ), и импорт сюда утянул бы его в основной бандл ради одной линии.
 */
export function ExerciseTrend({ catalogId }: { catalogId: number }) {
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .exerciseHistory(catalogId)
      .then((data) => active && setHistory(data))
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "История недоступна");
      });
    return () => {
      active = false;
    };
  }, [catalogId]);

  if (error) {
    return <p className="mt-5 text-center text-xs font-semibold text-red-200">{error}</p>;
  }
  if (!history) {
    return <p className="mt-5 text-center text-xs text-muted">Загружаю историю…</p>;
  }

  const { sessions, records } = history;
  if (sessions.length < 2) {
    return (
      <p className="mt-5 rounded-2xl bg-white/[0.035] px-4 py-3 text-center text-[11px] leading-relaxed text-white/40">
        {sessions.length === 0
          ? "Ещё не было тренировок с этим упражнением."
          : "Появится после второй тренировки с этим упражнением."}
      </p>
    );
  }

  const values = sessions.map((item) => item.topWeightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 100;
  const height = 34;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const growth = values[values.length - 1] - values[0];

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
          Рабочий вес · {sessions.length} трен.
        </p>
        {growth !== 0 && (
          <span
            className={`flex items-center gap-1 text-[11px] font-extrabold ${growth > 0 ? "text-accent" : "text-white/40"}`}
          >
            <TrendingUp size={12} />
            {growth > 0 ? "+" : ""}
            {round(growth)} кг
          </span>
        )}
      </div>

      <svg
        viewBox={`0 -3 ${width} ${height + 6}`}
        preserveAspectRatio="none"
        className="mt-2 h-20 w-full"
        role="img"
        aria-label={`Рабочий вес от ${round(values[0])} до ${round(values[values.length - 1])} кг за ${sessions.length} тренировок`}
      >
        <polyline
          points={points}
          fill="none"
          stroke="#b7f34a"
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {values.map((value, index) => (
          <circle
            key={index}
            cx={(index / (values.length - 1)) * width}
            cy={height - ((value - min) / span) * height}
            r={index === values.length - 1 ? 2.6 : 1.4}
            fill={index === values.length - 1 ? "#b7f34a" : "#5c6b3f"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] font-semibold text-white/30">
        <span>{round(values[0])} кг</span>
        <span>{round(values[values.length - 1])} кг</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <RecordTile label="Макс. вес" value={records.maxWeightKg?.value} unit="кг" />
        <RecordTile label="Макс. повторы" value={records.maxReps?.value} />
        <RecordTile label="Лучший объём" value={records.maxSessionVolumeKg?.value} unit="кг" />
      </div>
    </div>
  );
}

function RecordTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
}) {
  return (
    <div className="rounded-2xl border border-accent/10 bg-accent/[0.05] p-3 text-center">
      <Award size={13} className="mx-auto text-accent" />
      <p className="mt-1.5 text-sm font-extrabold tabular-nums">
        {value === null || value === undefined ? "—" : round(value)}
        {unit && value ? ` ${unit}` : ""}
      </p>
      <p className="mt-0.5 text-[9px] font-semibold leading-tight text-muted">{label}</p>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
