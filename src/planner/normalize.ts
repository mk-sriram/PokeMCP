import type {
  PlanningRequest,
  PlanningTask,
  PlanningTaskInput,
  TaskPriority,
  TravelMode,
} from "./types";

const ALLOWED_TRAVEL_MODES: TravelMode[] = [
  "walking",
  "driving",
  "transit",
  "bicycling",
];

function normalizePriority(priority?: string): TaskPriority {
  if (priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }

  return "medium";
}

function normalizeDuration(durationMinutes?: number): number {
  if (!Number.isFinite(durationMinutes) || !durationMinutes) {
    return 30;
  }

  return Math.max(5, Math.round(durationMinutes));
}

function normalizeTask(task: PlanningTaskInput, index: number): PlanningTask {
  const title = (task.title || "").trim() || `Task ${index + 1}`;
  const locationQuery = (task.locationQuery || "").trim() || undefined;
  const isFlexibleLocation =
    task.isFlexibleLocation === true || locationQuery === undefined;

  return {
    id: (task.id || "").trim() || `task_${index + 1}`,
    title,
    source: task.source,
    locationQuery,
    durationMinutes: normalizeDuration(task.durationMinutes),
    deadline: task.deadline,
    priority: normalizePriority(task.priority),
    isFlexibleLocation,
    isRequired: task.isRequired !== false,
  };
}

function assertIsoDate(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`${field} is required.`);
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO datetime string.`);
  }

  return value;
}

export function normalizePlanningRequest(input: PlanningRequest) {
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];

  if (tasks.length === 0) {
    throw new Error("At least one task is required.");
  }

  const currentLocation = (input.currentLocation || "").trim();

  if (!currentLocation) {
    throw new Error("currentLocation is required.");
  }

  const planningWindowStart = assertIsoDate(
    input.planningWindowStart,
    "planningWindowStart",
  );
  const planningWindowEnd = assertIsoDate(
    input.planningWindowEnd,
    "planningWindowEnd",
  );

  if (
    new Date(planningWindowEnd).getTime() <= new Date(planningWindowStart).getTime()
  ) {
    throw new Error("planningWindowEnd must be after planningWindowStart.");
  }

  const travelMode = ALLOWED_TRAVEL_MODES.includes(input.travelMode as TravelMode)
    ? (input.travelMode as TravelMode)
    : "walking";

  return {
    tasks: tasks.map(normalizeTask),
    currentLocation,
    planningWindowStart,
    planningWindowEnd,
    travelMode,
  };
}
