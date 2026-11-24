import type { Coordinate, Intersection, RouteResult } from "./types.js";
import { geoMeasure } from "./geo/measure.js";

// Meters added to a candidate's drive for things a locator should not do on the
// last mile, so a slightly longer surface-street approach beats an interchange.
export const ROUTE_PENALTY_METERS = {
  rampOrMerge: 500,
  toll: 1000,
  uturn: 300,
  limitedAccessStart: 1500,
} as const;

// Texas names some interstates "... Memorial Highway" (I-20 is Ronald Reagan Memorial Highway).
const LIMITED_ACCESS = /\b(I-?\s?\d+|IH-?\s?\d+|Interstate|Tollway|Turnpike|Tpke|Expressway|Expy|Freeway|Fwy|Memorial Highway)\b/i;
const LOCAL_ACCESS = /\b(Frontage|Service|Svc|Access|Frntg)\b/i;

/** Interstates, tollways and freeways; their frontage and service roads are local. */
export function isLimitedAccessRoad(name: string): boolean {
  return LIMITED_ACCESS.test(name) && !LOCAL_ACCESS.test(name);
}

export function routePenaltyMeters(route: RouteResult, candidate: Intersection): number {
  let penalty = 0;
  let toll = false;
  for (const step of route.steps) {
    const maneuver = step.navigationInstruction?.maneuver ?? "";
    const text = step.navigationInstruction?.instructions ?? "";
    if (/^RAMP_/.test(maneuver) || maneuver === "MERGE") penalty += ROUTE_PENALTY_METERS.rampOrMerge;
    if (/^UTURN_/.test(maneuver) || /u-turn/i.test(text)) penalty += ROUTE_PENALTY_METERS.uturn;
    if (/\btoll\b/i.test(text)) toll = true;
  }
  if (toll) penalty += ROUTE_PENALTY_METERS.toll;
  if ([candidate.street1, candidate.street2].some(isLimitedAccessRoad)) {
    penalty += ROUTE_PENALTY_METERS.limitedAccessStart;
  }
  return penalty;
}

// A meter off-road (walking or driving a field) costs this many on the road.
export const OFFROAD_WEIGHT = 2;

/** Meters from where the drive stops to the arrival vertex; 0 when the route has no end point. */
export function offRoadMeters(route: RouteResult, destination: Coordinate): number {
  return route.endLocation ? geoMeasure(route.endLocation, destination).distanceMeters : 0;
}

/** What the selection minimizes: drive + penalties + weighted off-road walk. */
export function selectionScore(route: RouteResult, candidate: Intersection, destination: Coordinate): number {
  return route.distanceMeters + routePenaltyMeters(route, candidate) + OFFROAD_WEIGHT * offRoadMeters(route, destination);
}

/** `count` points evenly spaced on a circle `radiusKm` around `center`, starting due north. */
export function ringPoints(center: Coordinate, radiusKm: number, count: number): Coordinate[] {
  const latKm = 111.32;
  const lngKm = latKm * Math.cos((center.lat * Math.PI) / 180);
  return Array.from({ length: count }, (_, i) => {
    const bearing = (2 * Math.PI * i) / count;
    return {
      lat: center.lat + (radiusKm / latKm) * Math.cos(bearing),
      lng: center.lng + (radiusKm / lngKm) * Math.sin(bearing),
    };
  });
}

/**
 * Distinct, non-freeway road names paired for an intersection lookup, at most
 * `max` pairs. Names arrive nearest-first; pairs of near roads come first.
 */
export function roadNamePairs(names: string[], max: number): Array<[string, string]> {
  const seen = new Set<string>();
  const roads: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || key === "unnamed road" || seen.has(key) || isLimitedAccessRoad(name)) continue;
    seen.add(key);
    roads.push(name);
  }
  const pairs: Array<{ pair: [string, string]; rank: number; i: number }> = [];
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) pairs.push({ pair: [roads[i], roads[j]], rank: i + j, i });
  }
  return pairs
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, max)
    .map((p) => p.pair);
}

/** The road a Google step puts you on: "Turn left onto Domingo Dr" -> "Domingo Dr". */
export function stepRoad(instruction: string): string | null {
  const line = instruction.split("\n")[0];
  const m = /\b(?:onto|on)\s+(.+?)(?:\s+toward\b.*|\s+heading\b.*)?$/i.exec(line);
  if (!m) return null;
  const road = m[1].split("/")[0].trim();
  return road && !/^(the|a|an)\b/i.test(road) ? road : null;
}

/** The cross street a step heads toward: "Head west on Aledo Rd toward Aledo Connector Rd". */
export function stepTowardRoad(instruction: string): string | null {
  const m = /\btoward\s+(.+?)(?:\s+heading\b.*)?$/i.exec(instruction.split("\n")[0]);
  if (!m) return null;
  const road = m[1].split("/")[0].trim();
  return road && !/^(the|a|an)\b/i.test(road) ? road : null;
}

/**
 * Junctions the route passes, nearest the destination first: where step k
 * leaves the road of step k-1 for a differently named one (`at` is known), and
 * the cross street a step heads toward (`at` is null: somewhere ahead).
 */
export function routeJunctions(route: RouteResult): Array<{ roads: [string, string]; at: Coordinate | null }> {
  const junctions: Array<{ roads: [string, string]; at: Coordinate | null }> = [];
  let previous: string | null = null;
  for (const step of route.steps) {
    const instruction = step.navigationInstruction?.instructions ?? "";
    const road = stepRoad(instruction);
    const loc = step.startLocation?.latLng;
    if (road && previous && road.toLowerCase() !== previous.toLowerCase() && loc) {
      junctions.push({ roads: [previous, road], at: { lat: loc.latitude, lng: loc.longitude } });
    }
    const current = road ?? previous;
    const toward = stepTowardRoad(instruction);
    if (current && toward && toward.toLowerCase() !== current.toLowerCase()) {
      junctions.push({ roads: [current, toward], at: null });
    }
    if (road) previous = road;
  }
  return junctions.reverse();
}

/** A point `meters` beyond `vertex` on the line from `center` through it. */
export function pointBeyond(center: Coordinate, vertex: Coordinate, meters: number): Coordinate {
  const latKm = 111.32;
  const lngKm = latKm * Math.cos((center.lat * Math.PI) / 180);
  const dy = (vertex.lat - center.lat) * latKm;
  const dx = (vertex.lng - center.lng) * lngKm;
  const len = Math.hypot(dx, dy) || 1;
  const km = meters / 1000;
  return { lat: vertex.lat + (dy / len) * (km / latKm), lng: vertex.lng + (dx / len) * (km / lngKm) };
}
