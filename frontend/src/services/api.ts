import { currentToken } from "./auth";
import { enqueue } from "./offlineQueue";
import { mockCatalog } from "../data/exerciseCatalog";
import {
  mockDashboard,
  mockDeleteTemplate,
  mockGoals,
  mockProgress,
  mockReminders,
  mockReorderTemplates,
  mockSaveTemplate,
} from "../data/mockData";
import type {
  BuilderExercise,
  CatalogExercise,
  ExerciseHistory,
  DashboardData,
  GoalData,
  ProgressData,
  ProgressPhotoData,
  ReminderData,
  SavedSet,
  SessionRecord,
  WorkoutDetail,
  WorkoutPlan,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1";
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

type ApiOptions = RequestInit & { body?: BodyInit | null };

/** Устройство не привязано или токен отозван — App покажет экран привязки. */
export class NotPairedError extends Error {
  constructor(message = "Устройство не привязано") {
    super(message);
    this.name = "NotPairedError";
  }
}

function authHeaders(): Record<string, string> {
  const token = currentToken();
  const initData = window.Telegram?.WebApp?.initData ?? "";
  if (token) return { Authorization: `Bearer ${token}` };
  if (initData) return { "X-Telegram-Init-Data": initData };
  return {};
}

function ensureAuthenticated(): void {
  if (USE_MOCKS) return;
  const headers = authHeaders();
  if (!headers.Authorization && !headers["X-Telegram-Init-Data"]) {
    throw new NotPairedError();
  }
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  ensureAuthenticated();
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { detail?: string } | null;
    if (response.status === 403) {
      throw new NotPairedError(error?.detail ?? "Доступ запрещён");
    }
    throw new Error(error?.detail ?? `Ошибка API: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function requestBlob(path: string): Promise<Blob> {
  ensureAuthenticated();
  const response = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Ошибка загрузки фото: ${response.status}`);
  return response.blob();
}

export interface QueuedResult {
  queued: true;
}

export function isQueued(value: unknown): value is QueuedResult {
  return typeof value === "object" && value !== null && "queued" in value;
}

/**
 * Запись, которую не страшно проиграть повторно. Если сети нет — уходит в
 * локальную очередь, а не теряется и не показывает пользователю ошибку.
 */
async function mutate<T>(
  path: string,
  method: string,
  body: unknown,
  label: string,
): Promise<T | QueuedResult> {
  ensureAuthenticated();
  try {
    return await request<T>(path, { method, body: JSON.stringify(body) });
  } catch (reason) {
    // fetch бросает TypeError только когда запрос не ушёл в сеть.
    if (reason instanceof TypeError) {
      await enqueue(path, method, body, label);
      return { queued: true };
    }
    throw reason;
  }
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
    mutate(
      `/workouts/${sessionId}/sets`,
      "PUT",
      {
        exercise_template_id: set.exerciseId,
        set_number: set.setNumber,
        weight_kg: set.weightKg,
        reps: set.reps,
        is_completed: true,
      },
      `Подход ${set.setNumber}`,
    ),
  completeWorkout: async (
    sessionId: number,
    feedback: { perceivedExertion?: number | null; notes?: string | null } = {},
  ): Promise<{ records: SessionRecord[] }> => {
    if (USE_MOCKS) return { records: [] };
    const raw = await request<Record<string, unknown>>(`/workouts/${sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        perceived_exertion: feedback.perceivedExertion ?? null,
        notes: feedback.notes?.trim() || null,
      }),
    });
    const records = Array.isArray(raw.records) ? raw.records : [];
    return {
      records: records.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          exerciseName: String(row.exercise_name ?? ""),
          kind: row.kind === "volume" ? "volume" : "weight",
          value: toNumber(row.value) ?? 0,
        } satisfies SessionRecord;
      }),
    };
  },
  exerciseHistory: async (catalogId: number): Promise<ExerciseHistory> => {
    if (USE_MOCKS) return mockHistory(catalogId);
    const raw = await request<Record<string, unknown>>(`/exercises/${catalogId}/history`);
    return mapHistory(raw);
  },
  cancelWorkout: (sessionId: number) =>
    USE_MOCKS
      ? Promise.resolve({ session_id: sessionId, cancelled: true })
      : request(`/workouts/${sessionId}/cancel`, {
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
      : mutate("/body-weight", "POST", { weight_kg: weightKg }, "Вес"),
  addNutrition: (calories: number, proteinG: number) =>
    USE_MOCKS
      ? Promise.resolve({ calories, protein_g: proteinG })
      : mutate(
          "/nutrition",
          "POST",
          { log_date: localDateString(), calories, protein_g: proteinG },
          "Питание",
        ),
  addCardio: (distanceKm: number, durationSeconds: number) =>
    USE_MOCKS
      ? Promise.resolve({ distance_km: distanceKm, duration_seconds: durationSeconds })
      : mutate(
          "/cardio",
          "POST",
          {
            activity_type: "run",
            distance_km: distanceKm,
            duration_seconds: durationSeconds,
          },
          "Кардио",
        ),
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
  exerciseCatalog: async (
    query?: string,
    muscleGroup?: string,
  ): Promise<CatalogExercise[]> => {
    if (USE_MOCKS) return filterCatalog(mockCatalog, query, muscleGroup);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (muscleGroup) params.set("muscle_group", muscleGroup);
    const suffix = params.toString() ? `?${params}` : "";
    const raw = await request<Array<Record<string, unknown>>>(`/exercises${suffix}`);
    return raw.map(mapCatalogExercise);
  },
  createCustomExercise: async (payload: {
    name: string;
    muscleGroup: string;
    equipment: string;
  }): Promise<CatalogExercise> => {
    if (USE_MOCKS) {
      const created: CatalogExercise = {
        id: Math.max(0, ...mockCatalog.map((item) => item.id)) + 1,
        name: payload.name,
        muscleGroup: payload.muscleGroup,
        equipment: payload.equipment,
        imageKey: null,
        isCustom: true,
      };
      mockCatalog.push(created);
      return created;
    }
    const raw = await request<Record<string, unknown>>("/exercises", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        muscle_group: payload.muscleGroup,
        equipment: payload.equipment,
      }),
    });
    return mapCatalogExercise(raw);
  },
  saveWorkoutTemplate: async (
    templateId: number | null,
    name: string,
    exercises: BuilderExercise[],
  ): Promise<WorkoutPlan> => {
    const body = JSON.stringify({
      name,
      exercises: exercises.map((item) => ({
        exercise_id: item.exerciseId,
        target_sets: item.targetSets,
        rep_min: item.repMin,
        rep_max: item.repMax,
        weight_kg: item.weightKg,
      })),
    });
    if (USE_MOCKS) return mockSaveTemplate(templateId, name, exercises);
    const raw = await request<Record<string, unknown>>(
      templateId ? `/workouts/templates/${templateId}` : "/workouts/templates",
      { method: templateId ? "PUT" : "POST", body },
    );
    return mapWorkoutPlan(raw);
  },
  reorderWorkoutTemplates: async (order: number[]): Promise<WorkoutPlan[]> => {
    if (USE_MOCKS) return mockReorderTemplates(order);
    const raw = await request<Array<Record<string, unknown>>>("/workouts/templates/order", {
      method: "PUT",
      body: JSON.stringify({ order }),
    });
    return raw.map(mapWorkoutPlan);
  },
  deleteWorkoutTemplate: async (templateId: number): Promise<void> => {
    if (USE_MOCKS) {
      mockDeleteTemplate(templateId);
      return;
    }
    await request(`/workouts/templates/${templateId}`, { method: "DELETE" });
  },
  progress: async (weeks = 8): Promise<ProgressData> => {
    if (USE_MOCKS) return { ...mockProgress, periodWeeks: weeks };
    const raw = await request<Record<string, unknown>>(`/progress?weeks=${weeks}`);
    return mapProgress(raw);
  },
  goals: async (): Promise<GoalData[]> => {
    if (USE_MOCKS) return mockGoals;
    const raw = await request<Array<Record<string, unknown>>>("/goals");
    return raw.map(mapGoal);
  },
  updateGoal: async (
    goalId: number,
    payload: { currentValue?: number | null; targetValue?: number | null },
  ): Promise<GoalData> => {
    if (USE_MOCKS) {
      const goal = mockGoals.find((item) => item.id === goalId) ?? mockGoals[0];
      if (payload.currentValue !== undefined) goal.currentValue = payload.currentValue;
      if (payload.targetValue !== undefined) goal.targetValue = payload.targetValue;
      return { ...goal };
    }
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
    if (USE_MOCKS) {
      const goal: GoalData = {
        id: Math.max(0, ...mockGoals.map((item) => item.id)) + 1,
        type: "custom",
        title: payload.title,
        currentValue: payload.currentValue ?? null,
        targetValue: payload.targetValue ?? null,
        unit: payload.unit || null,
        targetDate: null,
      };
      mockGoals.push(goal);
      return { ...goal };
    }
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
    if (USE_MOCKS) return mockReminders;
    const raw = await request<Array<Record<string, unknown>>>("/reminders");
    return raw.map(mapReminder);
  },
  updateReminder: async (
    reminderId: number,
    payload: { isActive?: boolean; localTime?: string },
  ): Promise<ReminderData> => {
    if (USE_MOCKS) {
      const reminder = mockReminders.find((item) => item.id === reminderId) ?? mockReminders[0];
      if (payload.isActive !== undefined) reminder.isActive = payload.isActive;
      if (payload.localTime) reminder.localTime = payload.localTime;
      return { ...reminder };
    }
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
    catalogId: toNumber(raw.exercise_id) ?? null,
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


function mapCatalogExercise(raw: Record<string, unknown>): CatalogExercise {
  return {
    id: toNumber(raw.id) ?? 0,
    name: String(raw.name ?? "Упражнение"),
    muscleGroup: String(raw.muscle_group ?? ""),
    equipment: String(raw.equipment ?? ""),
    imageKey: raw.image_key ? String(raw.image_key) : null,
    isCustom: Boolean(raw.is_custom),
  };
}

export function filterCatalog(
  items: CatalogExercise[],
  query?: string,
  muscleGroup?: string,
): CatalogExercise[] {
  const needle = query?.trim().toLowerCase();
  return items.filter(
    (item) =>
      (!muscleGroup || item.muscleGroup === muscleGroup) &&
      (!needle || item.name.toLowerCase().includes(needle)),
  );
}


function mapRecord(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const value = toNumber(row.value);
  if (value === null) return null;
  return { value, achievedAt: String(row.achieved_at ?? "") };
}

function mapHistory(raw: Record<string, unknown>): ExerciseHistory {
  const records = (raw.records ?? {}) as Record<string, unknown>;
  const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  return {
    exerciseId: toNumber(raw.exercise_id) ?? 0,
    name: String(raw.name ?? ""),
    records: {
      maxWeightKg: mapRecord(records.max_weight_kg),
      maxReps: mapRecord(records.max_reps),
      maxSessionVolumeKg: mapRecord(records.max_session_volume_kg),
    },
    sessions: sessions.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        completedAt: String(row.completed_at ?? ""),
        topWeightKg: toNumber(row.top_weight_kg) ?? 0,
        topReps: toNumber(row.top_reps) ?? 0,
        volumeKg: toNumber(row.volume_kg) ?? 0,
        sets: toNumber(row.sets) ?? 0,
      };
    }),
  };
}

/** Демо-режим: правдоподобный рост, чтобы раздел не выглядел пустым. */
function mockHistory(catalogId: number): ExerciseHistory {
  const base = 40 + (catalogId % 7) * 7.5;
  const day = 86_400_000;
  const sessions = Array.from({ length: 8 }, (_, index) => {
    const topWeightKg = base + Math.floor(index / 2) * 2.5;
    const topReps = 10 + (index % 3);
    return {
      completedAt: new Date(Date.now() - (8 - index) * 4 * day).toISOString(),
      topWeightKg,
      topReps,
      volumeKg: topWeightKg * topReps * 3,
      sets: 3,
    };
  });
  const best = sessions[sessions.length - 1];
  return {
    exerciseId: catalogId,
    name: "",
    records: {
      maxWeightKg: { value: best.topWeightKg, achievedAt: best.completedAt },
      maxReps: { value: 12, achievedAt: best.completedAt },
      maxSessionVolumeKg: { value: best.volumeKg, achievedAt: best.completedAt },
    },
    sessions,
  };
}
