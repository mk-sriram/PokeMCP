import type {
  PlannedStop,
  PlanningResult,
  TaskWithPlace,
  TravelEstimate,
  TravelMode,
} from "./types";

type PlanDayArgs = {
  tasks: TaskWithPlace[];
  currentLocation: string;
  planningWindowStart: string;
  planningWindowEnd: string;
  travelMode: TravelMode;
  getTravelEstimate: (
    origin: string | TaskWithPlace,
    destination: TaskWithPlace,
    departureTime: string,
    travelMode: TravelMode,
  ) => Promise<TravelEstimate>;
  warnings?: string[];
};

function toTime(value: string): number {
  return new Date(value).getTime();
}

function parseOffsetMinutes(isoString: string): number {
  const match = isoString.match(/([+-])(\d{2}):(\d{2})$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function formatWithOffset(timestamp: number, template: string): string {
  const offsetMinutes = parseOffsetMinutes(template);
  const shifted = new Date(timestamp + offsetMinutes * 60_000);
  const isoBase = shifted.toISOString().slice(0, 19);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${isoBase}${sign}${hours}:${minutes}`;
}

function addMinutes(isoString: string, minutes: number, template: string): string {
  return formatWithOffset(toTime(isoString) + minutes * 60_000, template);
}

function priorityScore(priority: TaskWithPlace["priority"]): number {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function buildCandidateScore(
  task: TaskWithPlace,
  travelMinutes: number,
  projectedEndMs: number,
): number {
  let score = travelMinutes * 3;

  if (task.deadline) {
    const deadlineMs = toTime(task.deadline);
    const slackMinutes = (deadlineMs - projectedEndMs) / 60_000;

    if (slackMinutes < 0) {
      score += 10_000 + Math.abs(slackMinutes) * 50;
    } else {
      score -= Math.min(600, 4_000 / Math.max(1, slackMinutes + 5));
    }
  }

  score -= priorityScore(task.priority) * 25;

  if (task.isFlexibleLocation || !task.place) {
    score += 20;
  }

  return score;
}

function buildSummary(stops: PlannedStop[]): string {
  if (stops.length === 0) {
    return "No feasible itinerary could be built.";
  }

  return `Best order is ${stops.map((stop) => stop.title).join(" -> ")}`;
}

export async function buildPlan({
  tasks,
  currentLocation,
  planningWindowStart,
  planningWindowEnd,
  travelMode,
  getTravelEstimate,
  warnings = [],
}: PlanDayArgs): Promise<PlanningResult> {
  const remaining = [...tasks];
  const stops: PlannedStop[] = [];
  const windowEndMs = toTime(planningWindowEnd);
  const scheduleTemplate = planningWindowStart;
  let cursorTime = planningWindowStart;
  let previousStop: TaskWithPlace | string = currentLocation;
  let totalTravelMinutes = 0;
  let totalTaskMinutes = 0;

  while (remaining.length > 0) {
    const candidates = await Promise.all(
      remaining.map(async (task) => {
        const travel = await getTravelEstimate(
          previousStop,
          task,
          cursorTime,
          travelMode,
        );
        const arrivalMs = toTime(cursorTime) + travel.durationMinutes * 60_000;
        const projectedEndMs = arrivalMs + task.durationMinutes * 60_000;

        return {
          task,
          travel,
          arrivalMs,
          projectedEndMs,
          score: buildCandidateScore(task, travel.durationMinutes, projectedEndMs),
        };
      }),
    );

    candidates.sort((left, right) => left.score - right.score);
    const next = candidates[0];

    if (!next) {
      break;
    }

    const leaveAt = cursorTime;
    const arriveAt = addMinutes(
      leaveAt,
      next.travel.durationMinutes,
      scheduleTemplate,
    );
    const startAt = arriveAt;
    const endAt = addMinutes(startAt, next.task.durationMinutes, scheduleTemplate);

    if (toTime(endAt) > windowEndMs) {
      warnings.push(
        `Planning window ends before "${next.task.title}" can finish.`,
      );
    }

    if (next.task.deadline && toTime(endAt) > toTime(next.task.deadline)) {
      warnings.push(`"${next.task.title}" is projected to miss its deadline.`);
    }

    stops.push({
      order: stops.length + 1,
      taskId: next.task.id,
      title: next.task.title,
      address: next.task.place?.address,
      place: next.task.place,
      leaveAt,
      arriveAt,
      startAt,
      endAt,
      travelMinutesBefore: next.travel.durationMinutes,
      durationMinutes: next.task.durationMinutes,
    });

    totalTravelMinutes += next.travel.durationMinutes;
    totalTaskMinutes += next.task.durationMinutes;
    cursorTime = endAt;
    previousStop = next.task;

    const nextIndex = remaining.findIndex((task) => task.id === next.task.id);
    remaining.splice(nextIndex, 1);
  }

  return {
    summary: buildSummary(stops),
    totalTravelMinutes,
    totalTaskMinutes,
    warnings,
    stops,
  };
}
