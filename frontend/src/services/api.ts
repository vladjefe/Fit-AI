import { mockDashboard } from "../data/mockData";
import type {
  DashboardData,
  GoalData,
  ProgressData,
  ProgressPhotoData,
  ReminderData,
  SavedSet,
  WorkoutDetail,
  WorkoutPlan,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1";
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

type ApiOptions = RequestInit & { body?: BodyInit | null };

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const initData = window.Telegram?.WebApp.initData ?? "";
  if (!USE_MOCKS && !initData) {
    throw new Error(
      "Открой FIT AI через Telegram Mini App. В обычном браузере Telegram не передаёт авторизацию, поэтому запись данных заблокирована.",
    );
  }
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "X-Telegram-Init-Data": initData,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(error?.detail ?? `Ошибка API: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function requestBlob(path: string): Promise<Blob> {
  const initData = window.Telegram?.WebApp.initData ?? "";
  if (!USE_MOCKS && !initData) {
    throw new Error("Открой FIT AI через Telegram Mini App");
  }
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "X-Telegram-Init-Data": initData },
  });
  if (!response.ok) throw new Error(`Ошибка загрузки фото: ${response.status}`);
  return response.blob();
}

export const api = {
  isMock: USE_MOCKS,

  async dashboard(): Promise<DashboardData> {
    if (USE_MOCKS) return Promise.resolve(mockDashboard);
    const raw = await request<Record<string, unknown>>("/dashboard");
    return mapDashboard(raw);
  },

  nextWorkout: () => request("/workouts/next"),
  workoutTemplates: async (): Promise<WorkoutPlan[]> => {
    if (USE_MOCKS) return mockDashboard.workoutTemplates;
    const raw = await request<Array<Record<string, unknown>>>("/workouts/templates");
    return raw.map(mapWorkoutPlan);
  },
  selectWorkout: (templateId: number) =>
    USE_MOCKS
      ? Promise.resolve({ template_id: templateId })
      : request("/workouts/select", {
          method: "POST",
          body: JSON.stringify({ template_id: templateId }),
        }),
  workoutDetail: async (sessionId: number): Promise<WorkoutDetail> => {
    const raw = await request<Record<string, unknown>>(`/workouts/${sessionId}`);
    return mapWorkoutDetail(raw);
  },
  startWorkout: (templateId?: number) =>
    USE_MOCKS
      ? Promise.resolve({
          session_id: 101,
          started_at: new Date().toISOString(),
          template_id: templateId ?? mockDashboard.nextWorkout.templateId,
          resumed: false,
        })
      : request<{ session_id: number; started_at: string; template_id: number; resumed: boolean }>("/workouts/start", {
          method: "POST",
          body: JSON.stringify(templateId ? { template_id: templateId } : {}),
        }),
  saveSet: (sessionId: number, set: SavedSet) =>
    request(`/workouts/${sessionId}/sets`, {
      method: "PUT",
      body: JSON.stringify({
        exercise_template_id: set.exerciseId,
        set_number: set.setNumber,
        weight_kg: set.weightKg,
        reps: set.reps,
        is_completed: true,
      }),
    }),
  completeWorkout: (sessionId: number) =>
    request(`/workouts/${sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify({ perceived_exertion: 8 }),
    }),
  cancelWorkout: (sessionId: number) =>
    request(`/workouts/${sessionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  deleteWorkout: (sessionId: number) =>
    request<{ deleted: boolean; session_id: number; workout_name?: string | null }>(
      `/workouts/${sessionId}`,
      { method: "DELETE" },
    ),
  deleteLatestWorkout: () =>
    request<{ deleted: boolean; session_id: number; workout_name?: string | null }>(
      "/workouts/latest",
      { method: "DELETE" },
    ),
  addWeight: (weightKg: number) =>
    USE_MOCKS
      ? Promise.resolve({ weight_kg: weightKg })
      : request("/body-weight", { method: "POST", body: JSON.stringify({ weight_kg: weightKg }) }),
  addNutrition: (calories: number, proteinG: number) =>
    USE_MOCKS
      ? Promise.resolve({ calories, protein_g: proteinG })
      : request("/nutrition", {
          method: "POST",
          body: JSON.stringify({ log_date: localDateString(), calories, protein_g: proteinG }),
        }),
  addCardio: (distanceKm: number, durationSeconds: number) =>
    USE_MOCKS
      ? Promise.resolve({ distance_km: distanceKm, duration_seconds: durationSeconds })
      : request("/cardio", {
          method: "POST",
          body: JSON.stringify({
            activity_type: "run",
            distance_km: distanceKm,
            duration_seconds: durationSeconds,
          }),
        }),
  weeklyAnalysis: () =>
    USE_MOCKS
      ? Promise.resolve({
          analysis:
            "1) Что хорошо: тренировки идут стабильно.\n2) Что улучшить: держать белок и сон.\n3) Следующая неделя: сохранить ритм и не форсировать объём.",
        })
      : request<{ analysis: string }>("/ai/weekly-analysis", {
          method: "POST",
          body: JSON.stringify({}),
        }),
  progress: async (weeks = 8): Promise<ProgressData> => {
    if (USE_MOCKS) {
      return {
        periodWeeks: weeks,
        workoutsCompleted: 0,
        totalVolumeKg: 0,
        weightStats: {
          firstKg: null,
          latestKg: null,
          changeKg: null,
          entries: 0,
          minKg: null,
          maxKg: null,
        },
        nutritionStats: {
          loggedDays: 0,
          averageCalories: null,
          averageProteinG: null,
        },
        workouts: [],
        bodyWeight: [],
        nutrition: [],
        cardio: [],
      };
    }
    const raw = await request<Record<string, unknown>>(`/progress?weeks=${weeks}`);
    return mapProgress(raw);
  },
  goals: async (): Promise<GoalData[]> => {
    if (USE_MOCKS) return [];
    const raw = await request<Array<Record<string, unknown>>>("/goals");
    return raw.map(mapGoal);
  },
  updateGoal: async (
    goalId: number,
    payload: { currentValue?: number | null; targetValue?: number | null },
  ): Promise<GoalData> => {
    const raw = await request<Record<string, unknown>>(`/goals/${goalId}`, {
      method: "PUT",
      body: JSON.stringify({
        ...(payload.currentValue !== undefined ? { current_value: payload.currentValue } : {}),
        ...(payload.targetValue !== undefined ? { target_value: payload.targetValue } : {}),
      }),
    });
    return mapGoal(raw);
  },
  createGoal: async (payload: {
    title: string;
    currentValue?: number | null;
    targetValue?: number | null;
    unit?: string | null;
  }): Promise<GoalData> => {
    const raw = await request<Record<string, unknown>>("/goals", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        goal_type: "custom",
        current_value: payload.currentValue ?? null,
        target_value: payload.targetValue ?? null,
        unit: payload.unit || null,
      }),
    });
    return mapGoal(raw);
  },
  reminders: async (): Promise<ReminderData[]> => {
    if (USE_MOCKS) return [];
    const raw = await request<Array<Record<string, unknown>>>("/reminders");
    return raw.map(mapReminder);
  },
  updateReminder: async (
    reminderId: number,
    payload: { isActive?: boolean; localTime?: string },
  ): Promise<ReminderData> => {
    const raw = await request<Record<string, unknown>>(`/reminders/${reminderId}`, {
      method: "PUT",
      body: JSON.stringify({
        ...(payload.isActive !== undefined ? { is_active: payload.isActive } : {}),
        ...(payload.localTime ? { local_time: payload.localTime } : {}),
      }),
    });
    return mapReminder(raw);
  },
  progressPhotos: async (): Promise<ProgressPhotoData[]> => {
    if (USE_MOCKS) return [];
    const raw = await request<Array<Record<string, unknown>>>("/progress-photos");
    return raw.map(mapProgressPhoto);
  },
  progressPhotoUrl: async (photoId: number): Promise<string> => {
    const blob = await requestBlob(`/progress-photos/${photoId}/file`);
    return URL.createObjectURL(blob);
  },
  uploadProgressPhoto: async (file: File): Promise<ProgressPhotoData> => {
    const body = new FormData();
    body.append("file", file);
    body.append("pose", "front");
    const raw = await request<Record<string, unknown>>("/progress-photos", {
      method: "POST",
      body,
    });
    return mapProgressPhoto(raw);
  },
};

function mapDashboard(raw: Record<string, unknown>): DashboardData {
  const next = raw.next_workout as Record<string, unknown>;
  const user = raw.user as Record<string, unknown>;
  const nutritionToday = raw.nutrition_today as Record<string, unknown> | null | undefined;
  const lastWorkout = raw.last_workout as Record<string, unknown> | null | undefined;
  const nextWorkout = mapWorkoutPlan(next);
  const templates = Array.isArray(raw.workout_templates)
    ? raw.workout_templates.map((item) => mapWorkoutPlan(item as Record<string, unknown>))
    : [];
  const latestWeight = toNumber(raw.latest_weight_kg);

  return {
    ...mockDashboard,
    userName: String(user?.display_name ?? mockDashboard.userName),
    cycleNumber: toNumber(next?.cycle_number) ?? toNumber(user?.cycle_number) ?? mockDashboard.cycleNumber,
    activeSessionId: toNumber(raw.active_session_id),
    activeSessionStartedAt:
      typeof raw.active_session_started_at === "string" ? raw.active_session_started_at : null,
    activeWorkoutTemplateId: toNumber(raw.active_workout_template_id),
    nextWorkout,
    workoutTemplates: templates.length ? templates : [nextWorkout],
    weight: {
      ...mockDashboard.weight,
      current: latestWeight ?? mockDashboard.weight.current,
    },
    pullUps: {
      ...mockDashboard.pullUps,
      current: toNumber(raw.best_pullups) ?? mockDashboard.pullUps.current,
    },
    nutritionToday: nutritionToday
      ? {
          calories: toNumber(nutritionToday.calories),
          proteinG: toNumber(nutritionToday.protein_g),
        }
      : null,
    lastWorkout: lastWorkout
      ? {
          id: toNumber(lastWorkout.id) ?? 0,
          name: String(lastWorkout.name ?? ""),
          completedAt: typeof lastWorkout.completed_at === "string" ? lastWorkout.completed_at : null,
          totalVolumeKg: toNumber(lastWorkout.total_volume_kg),
        }
      : null,
  };
}

function mapWorkoutPlan(raw: Record<string, unknown>): WorkoutPlan {
  const exercises = Array.isArray(raw?.exercises)
    ? raw.exercises.map((item) => mapExercise(item as Record<string, unknown>))
    : mockDashboard.nextWorkout.exercises;
  return {
    templateId: toNumber(raw?.template_id) ?? mockDashboard.nextWorkout.templateId,
    name: String(raw?.name ?? mockDashboard.nextWorkout.name),
    position: (toNumber(raw?.cycle_position) ?? 0) + 1,
    durationMinutes: Math.max(35, exercises.length * 10),
    isNext: Boolean(raw?.is_next),
    exercises,
  };
}

function mapExercise(raw: Record<string, unknown>) {
  const progression = raw.progression as Record<string, unknown> | undefined;
  const lastSets = Array.isArray(raw.last_sets) ? raw.last_sets : [];
  const weightKg = toNumber(progression?.recommended_weight_kg) ?? 0;
  const imagePath = String(raw.image_path ?? "");
  return {
    id: toNumber(raw.id) ?? 0,
    name: String(raw.name ?? "Упражнение"),
    imageKey:
      String(raw.image_key ?? "") ||
      imagePath.split("/").pop()?.replace(/\.(webp|png|jpg|jpeg)$/i, "") ||
      "placeholder",
    muscles: musclesFor(String(raw.name ?? "")),
    targetSets: toNumber(progression?.recommended_sets) ?? toNumber(raw.target_sets) ?? 3,
    repMin: toNumber(raw.rep_min) ?? 8,
    repMax: toNumber(raw.rep_max) ?? 12,
    weightKg,
    lastResult: lastSets.length
      ? `${weightKg} кг · ${lastSets
          .map((item) => toNumber((item as Record<string, unknown>).reps) ?? 0)
          .join(" / ")}`
      : "ещё не было",
  };
}

function mapProgress(raw: Record<string, unknown>): ProgressData {
  const weightStats = raw.weight_stats as Record<string, unknown> | undefined;
  const nutritionStats = raw.nutrition_stats as Record<string, unknown> | undefined;
  return {
    periodWeeks: toNumber(raw.period_weeks) ?? 8,
    workoutsCompleted: toNumber(raw.workouts_completed) ?? 0,
    totalVolumeKg: toNumber(raw.total_volume_kg) ?? 0,
    weightStats: {
      firstKg: toNumber(weightStats?.first_kg),
      latestKg: toNumber(weightStats?.latest_kg),
      changeKg: toNumber(weightStats?.change_kg),
      entries: toNumber(weightStats?.entries) ?? 0,
      minKg: toNumber(weightStats?.min_kg),
      maxKg: toNumber(weightStats?.max_kg),
    },
    nutritionStats: {
      loggedDays: toNumber(nutritionStats?.logged_days) ?? 0,
      averageCalories: toNumber(nutritionStats?.average_calories),
      averageProteinG: toNumber(nutritionStats?.average_protein_g),
    },
    workouts: Array.isArray(raw.workouts)
      ? raw.workouts.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            id: toNumber(row.id) ?? 0,
            name: String(row.name ?? ""),
            completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
            volumeKg: toNumber(row.volume_kg),
            exerciseCount: toNumber(row.exercise_count),
          };
        })
      : [],
    bodyWeight: Array.isArray(raw.body_weight)
      ? raw.body_weight.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            measuredAt: String(row.measured_at ?? ""),
            weightKg: toNumber(row.weight_kg) ?? 0,
          };
        })
      : [],
    nutrition: Array.isArray(raw.nutrition)
      ? raw.nutrition.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            logDate: String(row.log_date ?? ""),
            calories: toNumber(row.calories),
            proteinG: toNumber(row.protein_g),
          };
        })
      : [],
    cardio: Array.isArray(raw.cardio)
      ? raw.cardio.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            performedAt: String(row.performed_at ?? ""),
            activityType: String(row.activity_type ?? "run"),
            distanceKm: toNumber(row.distance_km) ?? 0,
            paceSecondsPerKm: toNumber(row.pace_seconds_per_km) ?? 0,
            averageSpeedKmh: toNumber(row.average_speed_kmh) ?? 0,
            isPersonalBest: Boolean(row.is_personal_best),
          };
        })
      : [],
  };
}

function mapGoal(raw: Record<string, unknown>): GoalData {
  return {
    id: toNumber(raw.id) ?? 0,
    type: String(raw.type ?? ""),
    title: String(raw.title ?? "Цель"),
    targetValue: toNumber(raw.target_value),
    currentValue: toNumber(raw.current_value),
    unit: raw.unit == null ? null : String(raw.unit),
    targetDate: typeof raw.target_date === "string" ? raw.target_date : null,
  };
}

function mapReminder(raw: Record<string, unknown>): ReminderData {
  return {
    id: toNumber(raw.id) ?? 0,
    type: String(raw.type ?? ""),
    localTime: String(raw.local_time ?? "20:00"),
    timezone: String(raw.timezone ?? "Europe/Moscow"),
    message: String(raw.message ?? ""),
    isActive: Boolean(raw.is_active),
    lastSentAt: typeof raw.last_sent_at === "string" ? raw.last_sent_at : null,
  };
}

function mapWorkoutDetail(raw: Record<string, unknown>): WorkoutDetail {
  return {
    sessionId: toNumber(raw.session_id) ?? 0,
    status: String(raw.status ?? ""),
    workoutName: String(raw.workout_name ?? ""),
    startedAt: typeof raw.started_at === "string" ? raw.started_at : null,
    completedAt: typeof raw.completed_at === "string" ? raw.completed_at : null,
    totalVolumeKg: toNumber(raw.total_volume_kg),
    perceivedExertion: toNumber(raw.perceived_exertion),
    notes: typeof raw.notes === "string" ? raw.notes : null,
    exercises: Array.isArray(raw.exercises)
      ? raw.exercises.map((item) => {
          const exercise = item as Record<string, unknown>;
          return {
            id: toNumber(exercise.id) ?? 0,
            name: String(exercise.name ?? "Упражнение"),
            imageKey:
              String(exercise.image_key ?? "") ||
              String(exercise.image_path ?? "")
                .split("/")
                .pop()
                ?.replace(/\.(webp|png|jpg|jpeg)$/i, "") ||
              "placeholder",
            sets: Array.isArray(exercise.sets)
              ? exercise.sets.map((set) => {
                  const row = set as Record<string, unknown>;
                  return {
                    setNumber: toNumber(row.set_number) ?? 0,
                    weightKg: toNumber(row.weight_kg),
                    reps: toNumber(row.reps) ?? 0,
                  };
                })
              : [],
          };
        })
      : [],
  };
}

function mapProgressPhoto(raw: Record<string, unknown>): ProgressPhotoData {
  return {
    id: toNumber(raw.id) ?? 0,
    takenAt: String(raw.taken_at ?? ""),
    pose: raw.pose == null ? null : String(raw.pose),
    note: raw.note == null ? null : String(raw.note),
    stored: Boolean(raw.stored),
  };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatPace(seconds: number): string {
  return formatDuration(seconds);
}

function musclesFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("жим") && lower.includes("ног")) return "ноги · ягодицы";
  if (lower.includes("присед") || lower.includes("разгибание")) return "квадрицепс · ягодицы";
  if (lower.includes("сгибание")) return "бицепс бедра";
  if (lower.includes("икры")) return "икроножные";
  if (lower.includes("жим") || lower.includes("груд")) return "грудь · трицепс";
  if (lower.includes("тяга") || lower.includes("т-гриф")) return "спина";
  if (lower.includes("бицепс")) return "бицепс";
  if (lower.includes("трицепс")) return "трицепс";
  if (lower.includes("дельт") || lower.includes("махи") || lower.includes("пек-дек")) return "дельты";
  if (lower.includes("мост")) return "ягодицы";
  return "рабочие мышцы";
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
