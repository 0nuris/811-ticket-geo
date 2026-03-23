import type {
  Coordinate,
  Intersection,
  ReverseGeocodeResult,
  RouteResult,
  SnappedPoint,
} from "../types.js";

const NEAREST_ROADS_URL = "https://roads.googleapis.com/v1/nearestRoads";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

interface AddressComponents {
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  stateCode?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

function parseAddressComponents(result: Record<string, unknown>): AddressComponents {
  const components = (result.address_components ?? []) as Array<{
    types: string[];
    long_name: string;
    short_name: string;
  }>;
  const info: AddressComponents = {};

  for (const comp of components) {
    const types = comp.types;
    if (types.includes("route")) info.street = comp.long_name;
    else if (types.includes("locality")) info.city = comp.long_name;
    else if (types.includes("administrative_area_level_2")) info.county = comp.long_name;
    else if (types.includes("administrative_area_level_1")) {
      info.state = comp.long_name;
      info.stateCode = comp.short_name;
    } else if (types.includes("postal_code")) info.zip = comp.long_name;
  }

  const geo = (result.geometry as Record<string, unknown>)?.location as
    | { lat: number; lng: number }
    | undefined;
  if (geo) {
    info.lat = geo.lat;
    info.lng = geo.lng;
  }

  return info;
}

async function geocodeRequest(
  apiKey: string,
  params: Record<string, string>
): Promise<Array<Record<string, unknown>>> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return [];
    const data = (await resp.json()) as { status: string; results: Array<Record<string, unknown>> };
    if (data.status === "OK") return data.results ?? [];
    return [];
  } catch {
    return [];
  }
}

export async function findNearestRoadPoint(
  apiKey: string,
  coordinates: Coordinate[]
): Promise<SnappedPoint[] | null> {
  const points = coordinates.map((c) => `${c.lat},${c.lng}`).join("|");
  const url = new URL(NEAREST_ROADS_URL);
  url.searchParams.set("points", points);
  url.searchParams.set("key", apiKey);

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      snappedPoints?: Array<{
        location: { latitude: number; longitude: number };
        originalIndex: number;
      }>;
    };

    if (!data.snappedPoints || data.snappedPoints.length === 0) return null;

    return data.snappedPoints.map((sp) => ({
      location: { lat: sp.location.latitude, lng: sp.location.longitude },
      originalIndex: sp.originalIndex,
    }));
  } catch {
    return null;
  }
}

export async function reverseGeocode(
  apiKey: string,
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const results = await geocodeRequest(apiKey, { latlng: `${lat},${lng}` });
  for (const result of results) {
    const types = (result.types ?? []) as string[];
    if (types.includes("route") || types.includes("street_address")) {
      const info = parseAddressComponents(result);
      if (info.street && info.lat !== undefined && info.lng !== undefined) {
        return {
          street: info.street,
          city: info.city,
          county: info.county,
          state: info.state,
          stateCode: info.stateCode,
          zip: info.zip,
          lat: info.lat,
          lng: info.lng,
        };
      }
    }
  }
  return null;
}

export async function googleValidates(
  apiKey: string,
  street1: string,
  street2: string
): Promise<AddressComponents | null> {
  const results = await geocodeRequest(apiKey, { address: `${street1} and ${street2}` });
  for (const result of results) {
    const types = (result.types ?? []) as string[];
    if (types.includes("intersection")) {
      return parseAddressComponents(result);
    }
  }
  return null;
}

export async function geocodeIntersection(
  apiKey: string,
  addressString: string
): Promise<Intersection | null> {
  const normalized = addressString.replace(/\s+and\s+/i, " & ");
  const results = await geocodeRequest(apiKey, { address: normalized });
  if (results.length === 0) return null;

  const info = parseAddressComponents(results[0]);
  if (info.lat === undefined || info.lng === undefined) return null;

  let street1 = "";
  let street2 = "";
  const split = normalized.split(/\s+&\s+/);
  if (split.length === 2) {
    street1 = split[0].trim();
    street2 = split[1].split(",")[0].trim();
  } else {
    street1 = normalized.trim();
  }

  const name = street2 ? `${street1} & ${street2}` : street1;

  return {
    name,
    street1,
    street2,
    lat: info.lat,
    lng: info.lng,
    county: info.county ?? "",
    city: info.city ?? "",
    state: info.state ?? "",
    stateCode: info.stateCode ?? "",
    zip: info.zip ?? "",
  };
}

type RouteData = {
  distanceMeters: number;
  legs: Array<{
    steps: Array<Record<string, unknown>>;
    localizedValues?: Record<string, unknown>;
  }>;
};

function routeHasUturn(route: RouteData): boolean {
  const steps = route.legs[0]?.steps ?? [];
  return steps.some((step) => {
    const instr =
      (step as Record<string, unknown>).navigationInstruction as { instructions?: string } | undefined;
    return (instr?.instructions ?? "").toLowerCase().includes("u-turn");
  });
}

export async function computeRoute(
  apiKey: string,
  origin: Coordinate,
  destination: Coordinate,
  heading?: number
): Promise<RouteResult | null> {
  const location: Record<string, unknown> = {
    latLng: { latitude: origin.lat, longitude: origin.lng },
  };
  if (heading !== undefined) {
    location.heading = Math.round(heading);
  }

  const body = {
    origin: { location },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    travelMode: "DRIVE",
    computeAlternativeRoutes: true,
  };

  try {
    const resp = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "routes.legs.steps.navigationInstruction",
          "routes.legs.steps.localizedValues",
          "routes.legs.localizedValues",
          "routes.legs.steps.startLocation",
          "routes.legs.startLocation",
          "routes.distanceMeters",
        ].join(","),
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      routes?: RouteData[];
    };

    if (!data.routes || data.routes.length === 0) return null;

    const routes = data.routes;
    const noUturn = routes.filter((r) => !routeHasUturn(r));
    const chosen = noUturn.length > 0 ? noUturn[0] : routes[0];

    const leg = chosen.legs[0];
    return {
      steps: leg.steps as unknown as RouteResult["steps"],
      distanceMeters: chosen.distanceMeters,
      localizedValues: leg.localizedValues as RouteResult["localizedValues"],
    };
  } catch {
    return null;
  }
}
