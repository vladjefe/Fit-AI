import type {
  BuilderExercise,
  DashboardData,
  GoalData,
  ProgressData,
  ReminderData,
  WorkoutPlan,
} from "../types";

export const mockDashboard: DashboardData = {
  userName: "Алексей",
  cycleNumber: 3,
  activeSessionId: null,
  activeSessionStartedAt: null,
  activeWorkoutTemplateId: null,
  nextWorkout: {
    templateId: 1,
    name: "Ноги 1",
    position: 1,
    isNext: true,
    durationMinutes: 55,
    exercises: [
      {
        id: 1,
        name: "Присед в гакке",
        imageKey: "hack-squat",
        muscles: "Квадрицепс · ягодицы",
        targetSets: 3,
        repMin: 10,
        repMax: 12,
        weightKg: 65,
        lastResult: "65 кг · 12 / 11 / 10",
      },
      {
        id: 2,
        name: "Разгибание голени сидя",
        imageKey: "seated-leg-extension",
        muscles: "Квадрицепс",
        targetSets: 3,
        repMin: 10,
        repMax: 12,
        weightKg: 42.5,
        lastResult: "42.5 кг · 12 / 12 / 11",
      },
      {
        id: 3,
        name: "Сгибание голени лежа",
        imageKey: "lying-leg-curl",
        muscles: "Бицепс бедра",
        targetSets: 3,
        repMin: 10,
        repMax: 12,
        weightKg: 42.5,
        lastResult: "42.5 кг · 11 / 10 / 10",
      },
      {
        id: 4,
        name: "Махи на среднюю дельту",
        imageKey: "lateral-raise",
        muscles: "Средняя дельта",
        targetSets: 3,
        repMin: 10,
        repMax: 12,
        weightKg: 10,
        lastResult: "10 кг · 12 / 11 / 10",
      },
      {
        id: 5,
        name: "Икры",
        imageKey: "calf-raise",
        muscles: "Икроножные",
        targetSets: 3,
        repMin: 12,
        repMax: 15,
        weightKg: 110,
        lastResult: "110 кг · 15 / 14 / 13",
      },
    ],
  },
  workoutTemplates: [],
  weight: { current: 84.6, target: 80, delta: -1.8 },
  pullUps: { current: 11, target: 20 },
  aiStatus: {
    score: 82,
    label: "Хорошая неделя",
    insight: "Сила растет, восстановление в норме",
  },
};

const upperBody1: WorkoutPlan = {
  templateId: 2,
  name: "Верх 1",
  position: 2,
  durationMinutes: 50,
  exercises: [
    {
      id: 6,
      name: "Жим штанги лёжа",
      imageKey: "barbell-bench-press",
      muscles: "Грудь · трицепс",
      targetSets: 4,
      repMin: 6,
      repMax: 10,
      weightKg: 70,
      lastResult: "70 кг · 10 / 9 / 8 / 8",
    },
    {
      id: 7,
      name: "Тяга верхнего блока",
      imageKey: "lever-lat-pulldown",
      muscles: "Широчайшие",
      targetSets: 4,
      repMin: 10,
      repMax: 12,
      weightKg: 60,
      lastResult: "60 кг · 12 / 11 / 10 / 10",
    },
    {
      id: 8,
      name: "Жим гантелей сидя",
      imageKey: "dumbbell-shoulder-press",
      muscles: "Передняя дельта",
      targetSets: 3,
      repMin: 10,
      repMax: 12,
      weightKg: 22.5,
      lastResult: "22.5 кг · 11 / 10 / 10",
    },
    {
      id: 9,
      name: "Разгибание на трицепс",
      imageKey: "rope-triceps-pushdown",
      muscles: "Трицепс",
      targetSets: 3,
      repMin: 12,
      repMax: 15,
      weightKg: 27.5,
      lastResult: "27.5 кг · 15 / 14 / 12",
    },
  ],
};

const legs2: WorkoutPlan = {
  templateId: 3,
  name: "Ноги 2",
  position: 3,
  durationMinutes: 55,
  exercises: [
    {
      id: 10,
      name: "Жим ногами",
      imageKey: "leg-press",
      muscles: "Квадрицепс · ягодицы",
      targetSets: 4,
      repMin: 10,
      repMax: 12,
      weightKg: 180,
      lastResult: "180 кг · 12 / 12 / 11 / 10",
    },
    {
      id: 11,
      name: "Ягодичный мост",
      imageKey: "hip-thrust",
      muscles: "Ягодицы",
      targetSets: 3,
      repMin: 10,
      repMax: 12,
      weightKg: 90,
      lastResult: "90 кг · 12 / 11 / 10",
    },
    {
      id: 12,
      name: "Сгибание голени сидя",
      imageKey: "seated-leg-curl",
      muscles: "Бицепс бедра",
      targetSets: 3,
      repMin: 10,
      repMax: 12,
      weightKg: 45,
      lastResult: "45 кг · 12 / 11 / 10",
    },
    {
      id: 13,
      name: "Икры",
      imageKey: "calf-raise",
      muscles: "Икроножные",
      targetSets: 3,
      repMin: 12,
      repMax: 15,
      weightKg: 110,
      lastResult: "110 кг · 15 / 14 / 14",
    },
  ],
};

const upperBody2: WorkoutPlan = {
  templateId: 4,
  name: "Верх 2",
  position: 4,
  durationMinutes: 48,
  exercises: [
    {
      id: 14,
      name: "Жим в тренажёре",
      imageKey: "lever-chest-press",
      muscles: "Грудь",
      targetSets: 4,
      repMin: 10,
      repMax: 12,
      weightKg: 55,
      lastResult: "55 кг · 12 / 11 / 10 / 10",
    },
    {
      id: 15,
      name: "Тяга Т-грифа",
      imageKey: "t-bar-row",
      muscles: "Спина",
      targetSets: 4,
      repMin: 8,
      repMax: 10,
      weightKg: 50,
      lastResult: "50 кг · 10 / 10 / 9 / 8",
    },
    {
      id: 16,
      name: "Обратная бабочка",
      imageKey: "reverse-pec-deck",
      muscles: "Задняя дельта",
      targetSets: 3,
      repMin: 12,
      repMax: 15,
      weightKg: 30,
      lastResult: "30 кг · 15 / 14 / 13",
    },
    {
      id: 17,
      name: "Подъём штанги на бицепс",
      imageKey: "barbell-curl",
      muscles: "Бицепс",
      targetSets: 3,
      repMin: 10,
      repMax: 12,
      weightKg: 30,
      lastResult: "30 кг · 12 / 11 / 10",
    },
  ],
};

mockDashboard.workoutTemplates = [mockDashboard.nextWorkout, upperBody1, legs2, upperBody2];
mockDashboard.nutritionToday = { calories: 2250, proteinG: 150 };
mockDashboard.lastWorkout = {
  id: 42,
  name: "Верх 2",
  completedAt: "2026-07-27T19:24:00Z",
  totalVolumeKg: 5840,
};

export const mockProgress: ProgressData = {
  periodWeeks: 8,
  workoutsCompleted: 21,
  totalVolumeKg: 148_600,
  weightStats: {
    firstKg: 86.4,
    latestKg: 84.6,
    changeKg: -1.8,
    entries: 47,
    minKg: 84.4,
    maxKg: 86.6,
  },
  nutritionStats: {
    loggedDays: 49,
    averageCalories: 2310,
    averageProteinG: 148,
  },
  workouts: [
    { id: 42, name: "Верх 2", completedAt: "2026-07-27", volumeKg: 5840, exerciseCount: 4 },
    { id: 41, name: "Ноги 2", completedAt: "2026-07-25", volumeKg: 9220, exerciseCount: 4 },
    { id: 40, name: "Верх 1", completedAt: "2026-07-22", volumeKg: 5360, exerciseCount: 4 },
    { id: 39, name: "Ноги 1", completedAt: "2026-07-20", volumeKg: 8940, exerciseCount: 5 },
    { id: 38, name: "Верх 2", completedAt: "2026-07-17", volumeKg: 5610, exerciseCount: 4 },
  ],
  bodyWeight: weightSeries(),
  nutrition: nutritionSeries(),
  cardio: [
    {
      performedAt: "2026-07-26",
      activityType: "run",
      distanceKm: 5,
      paceSecondsPerKm: 318,
      averageSpeedKmh: 11.3,
      isPersonalBest: true,
    },
    {
      performedAt: "2026-07-19",
      activityType: "run",
      distanceKm: 5,
      paceSecondsPerKm: 331,
      averageSpeedKmh: 10.9,
      isPersonalBest: false,
    },
    {
      performedAt: "2026-07-12",
      activityType: "run",
      distanceKm: 3.2,
      paceSecondsPerKm: 344,
      averageSpeedKmh: 10.5,
      isPersonalBest: false,
    },
  ],
};

export const mockGoals: GoalData[] = [
  {
    id: 1,
    type: "weight",
    title: "Дойти до 80 кг",
    currentValue: 84.6,
    targetValue: 80,
    unit: "кг",
    targetDate: "2026-10-01",
  },
  {
    id: 2,
    type: "pull_ups",
    title: "20 подтягиваний подряд",
    currentValue: 11,
    targetValue: 20,
    unit: "повт.",
    targetDate: "2026-12-01",
  },
  {
    id: 3,
    type: "strength",
    title: "Жим лёжа 90 кг",
    currentValue: 70,
    targetValue: 90,
    unit: "кг",
    targetDate: "2027-01-15",
  },
  {
    id: 4,
    type: "custom",
    title: "4 тренировки в неделю",
    currentValue: 3,
    targetValue: 4,
    unit: "трен.",
    targetDate: null,
  },
];

export const mockReminders: ReminderData[] = [
  {
    id: 1,
    type: "weight",
    localTime: "08:00",
    timezone: "Europe/Moscow",
    message: "Взвесься натощак",
    isActive: true,
    lastSentAt: "2026-07-29T05:00:00Z",
  },
  {
    id: 2,
    type: "nutrition",
    localTime: "21:00",
    timezone: "Europe/Moscow",
    message: "Запиши питание за день",
    isActive: true,
    lastSentAt: "2026-07-28T18:00:00Z",
  },
  {
    id: 3,
    type: "workout",
    localTime: "18:30",
    timezone: "Europe/Moscow",
    message: "Пора в зал",
    isActive: true,
    lastSentAt: "2026-07-27T15:30:00Z",
  },
  {
    id: 4,
    type: "photo",
    localTime: "10:00",
    timezone: "Europe/Moscow",
    message: "Сделай фото формы",
    isActive: false,
    lastSentAt: null,
  },
];

/** Плавное снижение веса за 8 недель — ряд для графика прогресса. */
function weightSeries(): ProgressData["bodyWeight"] {
  const start = new Date("2026-06-03T07:00:00Z").getTime();
  const values = [
    86.4, 86.6, 86.2, 86.1, 85.9, 86.0, 85.8, 85.6, 85.7, 85.5, 85.3, 85.4,
    85.2, 85.0, 85.1, 84.9, 84.8, 84.9, 84.7, 84.4, 84.6,
  ];
  return values.map((weightKg, index) => ({
    measuredAt: new Date(start + index * 2.8 * 86_400_000).toISOString().slice(0, 10),
    weightKg,
  }));
}

function nutritionSeries(): ProgressData["nutrition"] {
  const start = new Date("2026-07-08T07:00:00Z").getTime();
  const calories = [2280, 2410, 2190, 2350, 2260, 2520, 2140, 2300, 2380, 2210, 2290, 2340];
  return calories.map((value, index) => ({
    logDate: new Date(start + index * 86_400_000 * 1.8).toISOString().slice(0, 10),
    calories: value,
    proteinG: 140 + ((index * 7) % 22),
  }));
}

export const weightHistory = [
  { week: "12 май", value: 86.4 },
  { week: "19 май", value: 86.1 },
  { week: "26 май", value: 85.8 },
  { week: "2 июн", value: 85.5 },
  { week: "9 июн", value: 85.3 },
  { week: "16 июн", value: 85.0 },
  { week: "23 июн", value: 84.8 },
  { week: "30 июн", value: 84.6 },
];

export const strengthHistory = [
  { week: "12 май", bench: 62.5, pullups: 7 },
  { week: "26 май", bench: 65, pullups: 8 },
  { week: "9 июн", bench: 67.5, pullups: 9 },
  { week: "23 июн", bench: 70, pullups: 11 },
];

export const recentWorkouts = [
  { name: "Верх 2", date: "29 июня", volume: "5 840 кг", accent: "#b7f34a" },
  { name: "Ноги 2", date: "26 июня", volume: "9 220 кг", accent: "#7dd3fc" },
  { name: "Верх 1", date: "23 июня", volume: "5 360 кг", accent: "#c4b5fd" },
];

/** Демо-режим держит тренировки в памяти: перезапуск приложения их сбрасывает. */
export function mockSaveTemplate(
  templateId: number | null,
  name: string,
  exercises: BuilderExercise[],
): WorkoutPlan {
  const list = mockDashboard.workoutTemplates;
  const existingIndex = list.findIndex((item) => item.templateId === templateId);
  const plan: WorkoutPlan = {
    templateId: templateId ?? Math.max(0, ...list.map((item) => item.templateId)) + 1,
    name,
    position: existingIndex >= 0 ? list[existingIndex].position : list.length + 1,
    durationMinutes: Math.max(30, exercises.length * 10),
    exercises: exercises.map((item, index) => ({
      id: item.exerciseId * 1000 + index,
      catalogId: item.exerciseId,
      name: item.name,
      imageKey: item.imageKey ?? "placeholder",
      muscles: item.muscleGroup,
      targetSets: item.targetSets,
      repMin: item.repMin,
      repMax: item.repMax,
      weightKg: item.weightKg,
      lastResult: item.weightKg > 0 ? `${item.weightKg} кг · новое` : "Новое упражнение",
    })),
  };
  if (existingIndex >= 0) list[existingIndex] = plan;
  else list.push(plan);
  if (mockDashboard.nextWorkout.templateId === plan.templateId) {
    mockDashboard.nextWorkout = plan;
  }
  return plan;
}

export function mockDeleteTemplate(templateId: number): void {
  const list = mockDashboard.workoutTemplates;
  const index = list.findIndex((item) => item.templateId === templateId);
  if (index >= 0) list.splice(index, 1);
  list.forEach((item, order) => {
    item.position = order + 1;
  });
  if (mockDashboard.nextWorkout.templateId === templateId && list.length) {
    mockDashboard.nextWorkout = list[0];
  }
}

export function mockReorderTemplates(order: number[]): WorkoutPlan[] {
  const byId = new Map(mockDashboard.workoutTemplates.map((item) => [item.templateId, item]));
  const reordered = order
    .map((id) => byId.get(id))
    .filter((item): item is WorkoutPlan => Boolean(item));
  reordered.forEach((item, index) => {
    item.position = index + 1;
  });
  mockDashboard.workoutTemplates = reordered;
  mockDashboard.nextWorkout = reordered[0] ?? mockDashboard.nextWorkout;
  return reordered;
}
