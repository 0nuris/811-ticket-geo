import type {
  Coordinate,
  Intersection,
  IntersectionSearchContext,
  ReverseGeocodeResult,
  RouteResult,
  SnappedPoint,
} from "../types.js";
import { normalizeRoadName } from "../parsers/normalize.js";
import { geoMeasure } from "../geo/measure.js";

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
  // Canonical intersection name parsed from a Google `intersection` result's
  // formatted_address (the two cross streets are not in address_components).
  intersectionName?: string;
  intersectionStreet1?: string;
  intersectionStreet2?: string;
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
  street2: string,
  context?: { city?: string; stateCode?: string }
): Promise<AddressComponents | null> {
  // Expanded names (Co Rd -> County Road) first, then the TIGER names as given;
  // Google resolves some Texas roads only one way. See docs/decisions.md.
  const parts = [context?.city, context?.stateCode].filter(Boolean);
  const suffix = parts.length ? `, ${parts.join(", ")}` : "";
  const addresses = [
    `${normalizeRoadName(street1)} and ${normalizeRoadName(street2)}${suffix}`,
    `${collapseSpaces(street1)} and ${collapseSpaces(street2)}${suffix}`,
  ];
  for (const address of [...new Set(addresses)]) {
    const results = await geocodeRequest(apiKey, { address });
    for (const result of results) {
      const types = (result.types ?? []) as string[];
      if (!types.includes("intersection")) continue;
      const info = parseAddressComponents(result);
      const streets = parseIntersectionStreets(result);
      if (streets) {
        info.intersectionStreet1 = streets.street1;
        info.intersectionStreet2 = streets.street2;
        info.intersectionName = streets.name;
      }
      return info;
    }
  }
  return null;
}

// Farthest a hand-entered intersection may sit from the work area. The automatic
// search looks within 1 km, so anything past ~5 miles is not the site's intersection.
export const MAX_INTERSECTION_DISTANCE_METERS = 8000;

const METERS_PER_DEGREE_LAT = 111_320;

/** The cross streets of an `intersection` result, read from formatted_address ("A & B, city, ..."). */
export function parseIntersectionStreets(
  result: Record<string, unknown>
): { name: string; street1: string; street2: string } | null {
  const head = String(result.formatted_address ?? "").split(",")[0].trim();
  const streets = head.split(/\s*&\s*/);
  if (streets.length !== 2 || !streets[0] || !streets[1]) return null;
  return { name: `${streets[0]} & ${streets[1]}`, street1: streets[0], street2: streets[1] };
}

/** Meters from point to the nearest of the area's points. */
export function distanceToArea(point: Coordinate, area: Coordinate[]): number {
  let best = Infinity;
  for (const vertex of area) {
    best = Math.min(best, geoMeasure(point, vertex).distanceMeters);
  }
  return best;
}

function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Geocode request params for hand-entered intersection text, scoped to where the
 * intersection should be: the text as typed, then with road names expanded.
 * See docs/decisions.md, "Hand-entered intersections".
 */
export function buildIntersectionQueries(
  text: string,
  context: IntersectionSearchContext = {}
): Array<Record<string, string>> {
  const [streetPart, ...localityParts] = text.trim().replace(/\s+and\s+/i, " & ").split(",");
  const streets = streetPart.split(/\s*&\s*/);
  const typedLocality = localityParts.map((part) => part.trim()).filter(Boolean);
  const locality = typedLocality.length
    ? typedLocality
    : [context.city, context.stateCode].filter((part): part is string => Boolean(part));

  const shared: Record<string, string> = {
    components: context.stateCode ? `country:US|administrative_area:${context.stateCode}` : "country:US",
  };
  const area = context.area ?? [];
  if (area.length > 0) {
    const lats = area.map((c) => c.lat);
    const lngs = area.map((c) => c.lng);
    const padLat = MAX_INTERSECTION_DISTANCE_METERS / METERS_PER_DEGREE_LAT;
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const padLng = padLat / Math.max(Math.cos((midLat * Math.PI) / 180), 0.1);
    shared.bounds = `${Math.min(...lats) - padLat},${Math.min(...lngs) - padLng}|${Math.max(...lats) + padLat},${Math.max(...lngs) + padLng}`;
  }

  const addresses = [
    [streets.map(collapseSpaces).join(" & "), ...locality].join(", "),
    [streets.map((street) => normalizeRoadName(street)).join(" & "), ...locality].join(", "),
  ];
  return [...new Set(addresses)].map((address) => ({ address, ...shared }));
}

/** First `intersection` result within MAX_INTERSECTION_DISTANCE_METERS of the area, if any. */
export function selectNearbyIntersection(
  results: Array<Record<string, unknown>>,
  area: Coordinate[] = []
): Record<string, unknown> | null {
  for (const result of results) {
    const types = (result.types ?? []) as string[];
    if (!types.includes("intersection")) continue;
    if (area.length === 0) return result;
    const { lat, lng } = parseAddressComponents(result);
    if (lat === undefined || lng === undefined) continue;
    if (distanceToArea({ lat, lng }, area) <= MAX_INTERSECTION_DISTANCE_METERS) return result;
  }
  return null;
}

export async function geocodeIntersection(
  apiKey: string,
  addressString: string,
  context?: IntersectionSearchContext
): Promise<Intersection | null> {
  let match: Record<string, unknown> | null = null;
  for (const params of buildIntersectionQueries(addressString, context)) {
    match = selectNearbyIntersection(await geocodeRequest(apiKey, params), context?.area);
    if (match) break;
  }
  if (!match) return null;

  const info = parseAddressComponents(match);
  if (info.lat === undefined || info.lng === undefined) return null;

  const typed = addressString.replace(/\s+and\s+/i, " & ").split(",")[0].split(/\s*&\s*/);
  const streets = parseIntersectionStreets(match) ?? {
    name: typed.map((s) => s.trim()).filter(Boolean).join(" & "),
    street1: (typed[0] ?? "").trim(),
    street2: (typed[1] ?? "").trim(),
  };

  return {
    ...streets,
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
