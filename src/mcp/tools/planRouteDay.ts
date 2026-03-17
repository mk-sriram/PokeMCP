import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { buildPlan } from "../../planner/plan";
import { normalizePlanningRequest } from "../../planner/normalize";
import type {
  PlanningRequest,
  PlanningResult,
  ResolvedPlace,
  TaskWithPlace,
} from "../../planner/types";
import { createGoogleMapsService } from "../../services/googleMaps";

type Env = {
  GOOGLE_MAPS_API_KEY?: string;
};

const planningTaskSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  source: z.string().optional(),
  locationQuery: z.string().optional(),
  durationMinutes: z.number().optional(),
  deadline: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  isFlexibleLocation: z.boolean().optional(),
  isRequired: z.boolean().optional(),
});

const planRouteDayInputSchema = {
  tasks: z.array(planningTaskSchema).min(1),
  currentLocation: z.string(),
  planningWindowStart: z.string(),
  planningWindowEnd: z.string(),
  travelMode: z
    .enum(["walking", "driving", "transit", "bicycling"])
    .optional(),
};

const resolvedPlaceSchema = z.object({
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
});

const planRouteDayOutputSchema = {
  summary: z.string(),
  totalTravelMinutes: z.number(),
  totalTaskMinutes: z.number(),
  warnings: z.array(z.string()),
  stops: z.array(
    z.object({
      order: z.number(),
      taskId: z.string(),
      title: z.string(),
      address: z.string().optional(),
      place: resolvedPlaceSchema.optional(),
      leaveAt: z.string().optional(),
      arriveAt: z.string().optional(),
      startAt: z.string(),
      endAt: z.string(),
      travelMinutesBefore: z.number(),
      durationMinutes: z.number(),
    }),
  ),
};

function cacheKeyForPlace(place: ResolvedPlace): string {
  return place.placeId || `${place.lat},${place.lng}`;
}

export function registerPlanRouteDayTool(server: McpServer, env: Env) {
  server.registerTool(
    "plan_route_day",
    {
      title: "Plan Route Day",
      description:
        "Build a single recommended itinerary from tasks, location, window, and travel mode.",
      inputSchema: planRouteDayInputSchema,
      outputSchema: planRouteDayOutputSchema,
    },
    async (args: PlanningRequest) => {
      try {
        if (!env.GOOGLE_MAPS_API_KEY) {
          throw new Error("Missing GOOGLE_MAPS_API_KEY secret.");
        }

        const input = normalizePlanningRequest(args);
        const googleMaps = createGoogleMapsService(env.GOOGLE_MAPS_API_KEY);
        const warnings: string[] = [];
        const currentPlace = await googleMaps.resolvePlace(input.currentLocation);

        if (!currentPlace) {
          throw new Error("Could not resolve currentLocation into a Maps place.");
        }

        const tasksWithPlaces: TaskWithPlace[] = [];

        for (const task of input.tasks) {
          if (!task.locationQuery) {
            tasksWithPlaces.push(task);
            continue;
          }

          const place = await googleMaps.resolvePlace(task.locationQuery);

          if (!place) {
            warnings.push(
              `Could not resolve a place for "${task.title}". Treating it as a flexible task.`,
            );
            tasksWithPlaces.push({
              ...task,
              isFlexibleLocation: true,
            });
            continue;
          }

          tasksWithPlaces.push({
            ...task,
            place,
          });
        }

        const travelCache = new Map<string, number>();

        const result: PlanningResult = await buildPlan({
          tasks: tasksWithPlaces,
          currentLocation: input.currentLocation,
          planningWindowStart: input.planningWindowStart,
          planningWindowEnd: input.planningWindowEnd,
          travelMode: input.travelMode,
          warnings,
          getTravelEstimate: async (origin, destination, departureTime, travelMode) => {
            if (!destination.place) {
              return { durationMinutes: 0 };
            }

            const originPlace =
              typeof origin === "string" ? currentPlace : origin.place;

            if (!originPlace) {
              return { durationMinutes: 0 };
            }

            const key = [
              cacheKeyForPlace(originPlace),
              cacheKeyForPlace(destination.place),
              travelMode,
              departureTime,
            ].join("|");

            const cached = travelCache.get(key);

            if (cached !== undefined) {
              return { durationMinutes: cached };
            }

            const travel = await googleMaps.computeTravel(
              originPlace,
              destination.place,
              travelMode,
              departureTime,
            );

            travelCache.set(key, travel.durationMinutes);
            return travel;
          },
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `${result.summary}. Total travel: ${result.totalTravelMinutes} minutes.`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown planning error.";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        };
      }
    },
  );
}
