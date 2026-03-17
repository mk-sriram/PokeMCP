import type { ResolvedPlace, TravelEstimate, TravelMode } from "../planner/types";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

async function getResponseErrorDetails(response: Response): Promise<string> {
  try {
    const bodyText = await response.text();

    if (!bodyText) {
      return "No response body returned.";
    }

    return bodyText;
  } catch {
    return "Could not read error response body.";
  }
}

function parseDurationToMinutes(duration?: string): number {
  if (!duration) {
    return 0;
  }

  const seconds = Number(duration.replace("s", ""));

  if (!Number.isFinite(seconds)) {
    return 0;
  }

  return Math.max(0, Math.round(seconds / 60));
}

function mapTravelMode(travelMode: TravelMode): string {
  switch (travelMode) {
    case "driving":
      return "DRIVE";
    case "transit":
      return "TRANSIT";
    case "bicycling":
      return "BICYCLE";
    default:
      return "WALK";
  }
}

function toWaypoint(place: ResolvedPlace) {
  return {
    location: {
      latLng: {
        latitude: place.lat,
        longitude: place.lng,
      },
    },
  };
}

function buildRouteRequestBody(
  origin: ResolvedPlace,
  destination: ResolvedPlace,
  travelMode: TravelMode,
  departureTime?: string,
) {
  const body: Record<string, unknown> = {
    origin: toWaypoint(origin),
    destination: toWaypoint(destination),
    travelMode: mapTravelMode(travelMode),
  };

  if (travelMode === "driving" && departureTime) {
    body.routingPreference = "TRAFFIC_AWARE";
    body.departureTime = departureTime;
  } else if (travelMode === "transit" && departureTime) {
    body.departureTime = departureTime;
  }

  return body;
}

export function createGoogleMapsService(apiKey: string) {
  const placeCache = new Map<string, ResolvedPlace | null>();

  async function resolvePlace(query: string): Promise<ResolvedPlace | null> {
    const cacheKey = query.trim().toLowerCase();

    if (!cacheKey) {
      return null;
    }

    if (placeCache.has(cacheKey)) {
      return placeCache.get(cacheKey) ?? null;
    }

    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.id,places.location",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
      }),
    });

    if (!response.ok) {
      const details = await getResponseErrorDetails(response);
      throw new Error(
        `Google Places lookup failed with status ${response.status} for query "${query}". Response: ${details}`,
      );
    }

    const data: any = await response.json();
    const place = data.places?.[0];

    if (!place?.location) {
      placeCache.set(cacheKey, null);
      return null;
    }

    const resolved: ResolvedPlace = {
      name: place.displayName?.text || query,
      address: place.formattedAddress || query,
      lat: place.location.latitude,
      lng: place.location.longitude,
      placeId: place.id,
    };

    placeCache.set(cacheKey, resolved);
    return resolved;
  }

  async function computeTravel(
    origin: ResolvedPlace,
    destination: ResolvedPlace,
    travelMode: TravelMode,
    departureTime?: string,
  ): Promise<TravelEstimate> {
    if (
      origin.lat === destination.lat &&
      origin.lng === destination.lng
    ) {
      return { durationMinutes: 0, distanceMeters: 0 };
    }

    const response = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify(
        buildRouteRequestBody(origin, destination, travelMode, departureTime),
      ),
    });

    if (!response.ok) {
      const details = await getResponseErrorDetails(response);
      throw new Error(
        `Google Routes lookup failed with status ${response.status} for ${origin.address} -> ${destination.address} using mode ${travelMode}. Response: ${details}`,
      );
    }

    const data: any = await response.json();
    const route = data.routes?.[0];

    return {
      durationMinutes: parseDurationToMinutes(route?.duration),
      distanceMeters: route?.distanceMeters,
    };
  }

  return {
    resolvePlace,
    computeTravel,
  };
}
