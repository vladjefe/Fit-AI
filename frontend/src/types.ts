export type AppTab = "home" | "workout" | "progress" | "goals" | "profile";

export interface Exercise {
  id: number;
  /** id записи каталога: по нему запрашивается история. */
  catalogId?: number | null;
  name: string;
  imageKey: string;
  muscles: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  weightKg: number;
  lastResult: string;
}

export interface WorkoutPlan {
  templateId: number;
  name: string;
  position: number;
  durationMinutes: number;
  isNext?: boolean;
  exercises: Exercise[];
}

export interface DashboardData {
  userName: string;
  cycleNumber: number;
  activeSessionId: number | null;
  activeSessionStartedAt: string | null;
  activeWorkoutTemplateId: number | null;
  nextWorkout: WorkoutPlan;
  workoutTemplates: WorkoutPlan[];
  weight: { current: number; target: number; delta: number };
  pullUps: { current: number; target: number };
  aiStatus: { score: number; label: string; insight: string };
  nutritionToday?: { calories: number | null; proteinG: number | null } | null;
  lastWorkout?: { id: number; name: string; completedAt: string | null; totalVolumeKg: number | null } | null;
}

export interface SavedSet {
  exerciseId: number;
  setNumber: number;
  weightKg: number;
  reps: number;
}

export interface ProgressData {
  periodWeeks: number;
  workoutsCompleted: number;
  totalVolumeKg: number;
  weightStats: {
    firstKg: number | null;
    latestKg: number | null;
    changeKg: number | null;
    entries: number;
    minKg: number | null;
    maxKg: number | null;
  };
  nutritionStats: {
    loggedDays: number;
    averageCalories: number | null;
    averageProteinG: number | null;
  };
  workouts: Array<{
    id: number;
    name: string;
    completedAt: string | null;
    volumeKg: number | null;
    exerciseCount: number | null;
  }>;
  bodyWeight: Array<{
    measuredAt: string;
    weightKg: number;
  }>;
  nutrition: Array<{
    logDate: string;
    calories: number | null;
    proteinG: number | null;
  }>;
  cardio: Array<{
    performedAt: string;
    activityType: string;
    distanceKm: number;
    paceSecondsPerKm: number;
    averageSpeedKmh: number;
    isPersonalBest: boolean;
  }>;
}

export interface GoalData {
  id: number;
  type: string;
  title: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  targetDate: string | null;
}

export interface ReminderData {
  id: number;
  type: string;
  localTime: string;
  timezone: string;
  message: string;
  isActive: boolean;
  lastSentAt: string | null;
}

export interface WorkoutDetail {
  sessionId: number;
  status: string;
  workoutName: string;
  startedAt: string | null;
  completedAt: string | null;
  totalVolumeKg: number | null;
  perceivedExertion: number | null;
  notes: string | null;
  exercises: Array<{
    id: number;
    name: string;
    imageKey: string;
    sets: Array<{
      setNumber: number;
      weightKg: number | null;
      reps: number;
    }>;
  }>;
}

export interface ProgressPhotoData {
  id: number;
  takenAt: string;
  pose: string | null;
  note: string | null;
  stored: boolean;
}

export interface CatalogExercise {
  id: number;
  name: string;
  muscleGroup: string;
  equipment: string;
  imageKey: string | null;
  isCustom: boolean;
}

/** Строка конструктора: упражнение из каталога плюс заданные параметры. */
export interface BuilderExercise {
  exerciseId: number;
  name: string;
  imageKey: string | null;
  muscleGroup: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  weightKg: number;
}

export const MUSCLE_GROUPS = [
  "Грудь",
  "Спина",
  "Плечи",
  "Руки",
  "Ноги",
  "Ягодицы",
  "Пресс",
  "Кардио",
] as const;

export const EQUIPMENT_TYPES = [
  "Штанга",
  "Гантели",
  "Тренажёр",
  "Блок",
  "Смита",
  "Своё тело",
  "Гиря",
  "Функциональное",
  "Кардио",
] as const;

export interface ExerciseRecord {
  value: number;
  achievedAt: string;
}

export interface ExerciseHistory {
  exerciseId: number;
  name: string;
  records: {
    maxWeightKg: ExerciseRecord | null;
    maxReps: ExerciseRecord | null;
    maxSessionVolumeKg: ExerciseRecord | null;
  };
  sessions: Array<{
    completedAt: string;
    topWeightKg: number;
    topReps: number;
    volumeKg: number;
    sets: number;
  }>;
}

export interface SessionRecord {
  exerciseName: string;
  kind: "weight" | "volume";
  value: number;
}
