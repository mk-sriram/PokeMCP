import { describe, expect, it } from "vitest";

import { buildPlan } from "../src/planner/plan";
import type { TaskWithPlace } from "../src/planner/types";

const tasks: TaskWithPlace[] = [
  {
    id: "ups",
    title: "UPS Store",
    locationQuery: "UPS Store Ann Arbor",
    durationMinutes: 15,
    deadline: "2026-03-16T15:30:00-04:00",
    priority: "high",
    isFlexibleLocation: false,
    isRequired: true,
    place: {
      name: "UPS Store",
      address: "123 Example St",
      lat: 42.28,
      lng: -83.74,
    },
  },
  {
    id: "coffee",
    title: "Coffee Shop",
    locationQuery: "Coffee Shop Ann Arbor",
    durationMinutes: 60,
    priority: "medium",
    isFlexibleLocation: false,
    isRequired: true,
    place: {
      name: "Coffee Shop",
      address: "456 Example Ave",
      lat: 42.29,
      lng: -83.75,
    },
  },
];

describe("buildPlan", () => {
  it("prioritizes a deadline task first and builds stop times", async () => {
    const result = await buildPlan({
      tasks,
      currentLocation: "Home",
      planningWindowStart: "2026-03-16T13:00:00-04:00",
      planningWindowEnd: "2026-03-16T18:00:00-04:00",
      travelMode: "walking",
      getTravelEstimate: async (origin, destination) => {
        if (typeof origin === "string" && destination.id === "ups") {
          return { durationMinutes: 12 };
        }

        if (typeof origin === "string" && destination.id === "coffee") {
          return { durationMinutes: 25 };
        }

        if (typeof origin !== "string" && origin.id === "ups") {
          return { durationMinutes: 7 };
        }

        return { durationMinutes: 10 };
      },
    });

    expect(result.stops).toHaveLength(2);
    expect(result.stops[0].taskId).toBe("ups");
    expect(result.stops[0].arriveAt).toBe("2026-03-16T13:12:00-04:00");
    expect(result.stops[1].taskId).toBe("coffee");
    expect(result.totalTravelMinutes).toBe(19);
  });

  it("adds a warning when a task misses its deadline", async () => {
    const result = await buildPlan({
      tasks: [
        {
          ...tasks[0],
          deadline: "2026-03-16T13:10:00-04:00",
        },
      ],
      currentLocation: "Home",
      planningWindowStart: "2026-03-16T13:00:00-04:00",
      planningWindowEnd: "2026-03-16T18:00:00-04:00",
      travelMode: "walking",
      getTravelEstimate: async () => ({ durationMinutes: 20 }),
    });

    expect(result.warnings[0]).toContain("miss its deadline");
  });
});
