export type TaskPriority = "low" | "medium" | "high";
export type TravelMode = "walking" | "driving" | "transit" | "bicycling";

export type PlanningTaskInput = {
  id?: string;
  title?: string;
  source?: string;
  locationQuery?: string;
  durationMinutes?: number;
  deadline?: string;
  priority?: string;
  isFlexibleLocation?: boolean;
  isRequired?: boolean;
};

export type PlanningRequest = {
  tasks?: PlanningTaskInput[];
  currentLocation?: string;
  planningWindowStart?: string;
  planningWindowEnd?: string;
  travelMode?: string;
};

export type PlanningTask = {
  id: string;
  title: string;
  source?: string;
  locationQuery?: string;
  durationMinutes: number;
  deadline?: string;
  priority: TaskPriority;
  isFlexibleLocation: boolean;
  isRequired: boolean;
};

export type ResolvedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
};

export type TaskWithPlace = PlanningTask & {
  place?: ResolvedPlace;
};

export type PlannedStop = {
  order: number;
  taskId: string;
  title: string;
  address?: string;
  place?: ResolvedPlace;
  leaveAt?: string;
  arriveAt?: string;
  startAt: string;
  endAt: string;
  travelMinutesBefore: number;
  durationMinutes: number;
};

export type PlanningResult = {
  summary: string;
  totalTravelMinutes: number;
  totalTaskMinutes: number;
  warnings: string[];
  stops: PlannedStop[];
};

export type TravelEstimate = {
  durationMinutes: number;
  distanceMeters?: number;
};
