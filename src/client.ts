import type {
  ClientConfig,
  Coordinate,
  FindIntersectionOptions,
  Intersection,
  IntersectionSearchContext,
  IntersectionSelectionResult,
  ProcessSiteOptions,
  ReverseGeocodeResult,
  RouteResult,
  SelectIntersectionOptions,
  SiteResult,
  SnappedPoint,
} from "./types.js";
import {
  findNearestRoadPoint as apiFindNearestRoadPoint,
  reverseGeocode as apiReverseGeocode,
  geocodeIntersection as apiGeocodeIntersection,
  computeRoute as apiComputeRoute,
} from "./api/google.js";
import {
  findNearestIntersection as apiFindNearestIntersection,
  findIntersectionCandidates as apiFindIntersectionCandidates,
  fetchIntersectionNodes,
  validateIntersectionNodes,
  type GeoNamesCandidate,
} from "./api/geonames.js";
import { distanceToArea } from "./api/google.js";
import { ticketLocality } from "./locality.js";
import {
  isLimitedAccessRoad,
  eligibleRoadNames,
  offRoadMeters,
  pairNamesNeeded,
  pointBeyond,
  ROUTE_BOUND_SLACK_METERS,
  ringPoints,
  roadNamePairs,
  routeJunctions,
  routePenaltyMeters,
  selectionScore,
} from "./selection.js";
import { geoMeasure, bearingToCardinal } from "./geo/measure.js";
import { formatDirections, formatMarkingText } from "./directions/format.js";
import { polygonAreaAcres, boundingBoxFeet } from "./geo/area.js";

function coordinatesEqual(a: Coordinate, b: Coordinate): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

function rotateCoordinatesToStart(
  coordinates: Coordinate[],
  start: Coordinate
): Coordinate[] {
  if (coordinates.length === 0) return [];

  const isClosed =
    coordinates.length > 1 &&
    coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1]);
  const openCoordinates = isClosed ? coordinates.slice(0, -1) : coordinates.slice();
  const startIndex = openCoordinates.findIndex((coord) => coordinatesEqual(coord, start));

  if (startIndex <= 0) {
    return isClosed
      ? [...openCoordinates, openCoordinates[0]]
      : openCoordinates;
  }

  const rotated = [
    ...openCoordinates.slice(startIndex),
    ...openCoordinates.slice(0, startIndex),
  ];

  return isClosed ? [...rotated, rotated[0]] : rotated;
}

function extractTurnStreets(steps: RouteResult["steps"]): { from: string | null; onto: string | null } {
  for (let i = steps.length - 1; i >= 0; i--) {
    const maneuver = steps[i].navigationInstruction?.maneuver ?? "";
    if (maneuver === "TURN_LEFT" || maneuver === "TURN_RIGHT") {
      const instruction = steps[i].navigationInstruction?.instructions ?? "";
      const ontoMatch = instruction.match(/onto (.+?)(?:\s*\(|$)/);
      const fromMatch = instruction.match(/on (.+?)(?:\s+toward|\s*\(|$)/);
      return {
        from: fromMatch ? fromMatch[1].trim() : null,
        onto: ontoMatch ? ontoMatch[1].trim() : null,
      };
    }
  }
  return { from: null, onto: null };
}

function nearestCoordinateToTarget(
  coordinates: Coordinate[],
  target: Coordinate
): { coordinate: Coordinate; distanceMeters: number } | null {
  if (coordinates.length === 0) return null;

  let bestDistance = Infinity;
  let bestCoordinate = coordinates[0];

  for (const coordinate of coordinates) {
    const { distanceMeters } = geoMeasure(target, coordinate);
    if (distanceMeters < bestDistance) {
      bestDistance = distanceMeters;
      bestCoordinate = coordinate;
    }
  }

  return { coordinate: bestCoordinate, distanceMeters: bestDistance };
}

function polygonCentroid(coordinates: Coordinate[]): Coordinate {
  const count = coordinates.length;
  let lat = 0;
  let lng = 0;
  for (const coordinate of coordinates) {
    lat += coordinate.lat;
    lng += coordinate.lng;
  }
  return { lat: lat / count, lng: lng / count };
}

// All candidates are routed, so this is the API-cost knob: 3 missed a shorter
// drive at a quarter of 60 measured sites (docs/decisions.md, "Choosing the intersection").
const DEFAULT_MAX_CANDIDATES = 8;
const RING_RADII_KM = [1.5, 3];
const RING_POINTS = 8;
// Pairs of the nearest road names, nearest first (reaches the 11th name).
const MAX_ROAD_NAME_PAIRS = 28;
const ROAD_NAMES_NEEDED = pairNamesNeeded(MAX_ROAD_NAME_PAIRS);
// Candidates routed before the rest are checked against the best score so far.
const FIRST_ROUTE_WAVE = 2;
const MEMO_LIMIT = 5000;
// GeoNames lacks many subdivision crossings; past this score, also ask Google
// about pairs of the site's own roads (docs/decisions.md, "Choosing the intersection").
const ROAD_NAME_SEARCH_ABOVE_METERS = 300;
// Try other arrival vertices when the drive is penalized or ends this far from the vertex.
const ARRIVAL_RETRY_OFFROAD_METERS = 100;
const ARRIVAL_ALTERNATIVES = 4;
// A route junction counts as that crossing only if the geocoded pair is this close.
const JUNCTION_MATCH_METERS = 150;
const ROUTE_JUNCTIONS_TRIED = 3;
const JUNCTION_WALK_ROUNDS = 3;
const MAX_PROBE_VERTICES = 8;
// Bursts past Google's per-second limit come back empty, not as errors.
const PROBE_CONCURRENCY = 10;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function dedupeCoordinates(coordinates: Coordinate[]): Coordinate[] {
  const seen = new Set<string>();
  return coordinates.filter((c) => {
    const key = coordinateKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function betterSelection(
  a: IntersectionSelectionResult | null,
  b: IntersectionSelectionResult | null
): IntersectionSelectionResult | null {
  if (!a) return b;
  if (!b) return a;
  return b.score < a.score ? b : a;
}

function coordinateKey(coordinate: Coordinate): string {
  return `${coordinate.lat},${coordinate.lng}`;
}

// Search origins for the lazy intersection fallback: the bounding-box extreme
// vertices of the work area (min/max lat, min/max lng), mapped onto their
// snapped road point when one exists. These sit on the polygon perimeter, where
// through-roads — and therefore mapped GeoNames/TIGER intersections — actually
// are, unlike a tightly-snapped interior point on a new subdivision street.
// The set is deduplicated, has the already-tried `primary` point removed, and is
// naturally capped at four points so the fallback's API cost stays bounded
// regardless of how many vertices the polygon has.
function boundingBoxExtremeOrigins(
  coordinates: Coordinate[],
  snappedPoints: SnappedPoint[],
  primary: Coordinate
): Coordinate[] {
  if (coordinates.length === 0) return [];

  const snapByIndex = new Map<number, Coordinate>();
  for (const sp of snappedPoints) {
    if (!snapByIndex.has(sp.originalIndex)) snapByIndex.set(sp.originalIndex, sp.location);
  }

  let minLat = 0;
  let maxLat = 0;
  let minLng = 0;
  let maxLng = 0;
  coordinates.forEach((c, i) => {
    if (c.lat < coordinates[minLat].lat) minLat = i;
    if (c.lat > coordinates[maxLat].lat) maxLat = i;
    if (c.lng < coordinates[minLng].lng) minLng = i;
    if (c.lng > coordinates[maxLng].lng) maxLng = i;
  });

  const seen = new Set<string>([coordinateKey(primary)]);
  const origins: Coordinate[] = [];
  for (const idx of [minLat, maxLat, minLng, maxLng]) {
    const origin = snapByIndex.get(idx) ?? coordinates[idx];
    const key = coordinateKey(origin);
    if (seen.has(key)) continue;
    seen.add(key);
    origins.push(origin);
  }
  return origins;
}

export class TicketGeoClient {
  private readonly googleApiKey: string;
  private readonly geonamesUsername: string;
  // The selection asks the same question from several paths (a junction that is
  // also a pair, a vertex retried); each billable answer is fetched once.
  private readonly memo = new Map<string, Promise<unknown>>();

  constructor(config: ClientConfig) {
    this.googleApiKey = config.googleMapsApiKey;
    this.geonamesUsername = config.geonamesUsername;
  }

  private remember<T>(key: string, load: () => Promise<T>): Promise<T> {
    let hit = this.memo.get(key) as Promise<T> | undefined;
    if (!hit) {
      if (this.memo.size >= MEMO_LIMIT) this.memo.clear();
      hit = load();
      this.memo.set(key, hit);
    }
    return hit;
  }

  async findNearestRoadPoint(coordinates: Coordinate[]): Promise<SnappedPoint[]> {
    const result = await apiFindNearestRoadPoint(this.googleApiKey, coordinates);
    if (!result) throw new Error("Roads API returned no snapped points");
    return result;
  }

  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    return this.remember(`rev|${lat},${lng}`, () => apiReverseGeocode(this.googleApiKey, lat, lng));
  }

  /** The work area's own address components, for callers that skip processSite. */
  async locateWorkArea(coordinates: Coordinate[]): Promise<ReverseGeocodeResult | null> {
    if (coordinates.length === 0) return null;
    const centroid = polygonCentroid(coordinates);
    return this.reverseGeocode(centroid.lat, centroid.lng);
  }

  async geocodeIntersection(
    address: string,
    context?: IntersectionSearchContext
  ): Promise<Intersection | null> {
    return this.remember(`ix|${address}|${JSON.stringify(context ?? {})}`, () =>
      apiGeocodeIntersection(this.googleApiKey, address, context)
    );
  }

  async findNearestIntersection(
    lat: number,
    lng: number,
    options?: FindIntersectionOptions
  ): Promise<Intersection | null> {
    return apiFindNearestIntersection(
      this.googleApiKey,
      this.geonamesUsername,
      lat,
      lng,
      options
    );
  }

  async computeRoute(
    origin: Coordinate,
    destination: Coordinate,
    heading?: number
  ): Promise<RouteResult | null> {
    return this.remember(`route|${origin.lat},${origin.lng}|${destination.lat},${destination.lng}|${heading}`, () =>
      apiComputeRoute(this.googleApiKey, origin, destination, heading)
    );
  }

  /**
   * Selects the intersection with the shortest routed distance to the work area.
   *
   * Strategy: Query GeoNames for candidate intersections within radiusKm of the
   * snapped road point, route each one to its nearest polygon vertex, and keep
   * the shortest drive. Routing is what decides — a linearly closer intersection
   * routinely has a longer drive (dead ends, divided roads, one-ways), which is
   * exactly the case a straight-line ranking gets wrong.
   *
   * Candidate count is bounded by maxCandidates (the API-cost knob), so every
   * candidate is routed. An earlier version additionally kept only the linearly
   * nearest candidate per compass quadrant; candidates cluster on the road-network
   * side of a site, so the two best routinely shared a quadrant and the better one
   * was discarded before it was ever routed. See the ticket-2673195855 case in
   * tests/client.test.ts.
   */
  async selectShortestRouteIntersection(
    coordinates: Coordinate[],
    options?: SelectIntersectionOptions
  ): Promise<IntersectionSelectionResult | null> {
    if (coordinates.length === 0) return null;

    let snappedPoint = options?.snappedPoint;
    if (!snappedPoint) {
      const snappedPoints = await this.findNearestRoadPoint(coordinates);
      let bestSnapDistance = Infinity;

      for (const snapped of snappedPoints) {
        const original = coordinates[snapped.originalIndex];
        const { distanceMeters } = geoMeasure(original, snapped.location);
        if (distanceMeters < bestSnapDistance) {
          bestSnapDistance = distanceMeters;
          snappedPoint = snapped.location;
        }
      }
    }

    if (!snappedPoint) return null;

    // Every candidate is routed and scored, so the preferred road only orders ties;
    // it is not worth a reverse geocode when the caller has none.
    const preferredRoad = options?.preferredRoad;

    const candidates = await apiFindIntersectionCandidates(
      this.googleApiKey,
      this.geonamesUsername,
      snappedPoint.lat,
      snappedPoint.lng,
      {
        preferredRoad,
        maxCandidates: options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
        radiusKm: options?.radiusKm,
      }
    );

    return this.routeCandidates(coordinates, candidates);
  }

  /**
   * Routes every candidate to its nearest work-area vertex (in parallel) and
   * keeps the lowest score: drive length plus routePenaltyMeters. Within 10 m of
   * each other, the linearly nearer candidate wins.
   */
  async routeCandidates(
    coordinates: Coordinate[],
    candidates: Intersection[]
  ): Promise<IntersectionSelectionResult | null> {
    type Routed = { result: IntersectionSelectionResult; linear: number; order: number };
    const entries = candidates
      .map((candidate, order) => ({ candidate, order, nearest: nearestCoordinateToTarget(coordinates, candidate) }))
      .filter((e): e is { candidate: Intersection; order: number; nearest: { coordinate: Coordinate; distanceMeters: number } } => e.nearest !== null)
      .sort((a, b) => a.nearest.distanceMeters - b.nearest.distanceMeters);

    const routeOne = async ({ candidate, order, nearest }: (typeof entries)[number]): Promise<Routed | null> => {
      const { bearingDegrees: heading } = geoMeasure(candidate, nearest.coordinate);
      const route = await this.computeRoute(candidate, nearest.coordinate, heading);
      if (!route) return null;
      return {
        result: { intersection: candidate, nearestCoordinate: nearest.coordinate, route, score: selectionScore(route, candidate, nearest.coordinate) },
        linear: nearest.distanceMeters,
        order,
      };
    };

    // Nearest first; a candidate farther (in a straight line) than the best
    // score so far cannot win, so it is never routed.
    const firstWave = (await Promise.all(entries.slice(0, FIRST_ROUTE_WAVE).map(routeOne))).filter((r): r is Routed => r !== null);
    const bounded = firstWave.length > 0 && firstWave.every((r) => r.result.route.endLocation);
    const bestSoFar = Math.min(...firstWave.map((r) => r.result.score));
    const rest = entries
      .slice(FIRST_ROUTE_WAVE)
      .filter((e) => !bounded || e.nearest.distanceMeters <= bestSoFar + ROUTE_BOUND_SLACK_METERS);
    const routed = [...firstWave, ...(await Promise.all(rest.map(routeOne)))]
      .filter((r): r is Routed => r !== null)
      .sort((a, b) => a.order - b.order);

    let best: { result: IntersectionSelectionResult; linear: number } | null = null;
    for (const entry of routed) {
      if (!entry) continue;
      const better = !best || entry.result.score < best.result.score - 10;
      const tiedButNearer =
        !!best && Math.abs(entry.result.score - best.result.score) <= 10 && entry.linear < best.linear;
      if (better || tiedButNearer) best = entry;
    }
    return best ? this.refineArrival(coordinates, best.result) : null;
  }

  /**
   * The vertex nearest the intersection can sit beside a freeway or deep in a
   * field. When the drive there is penalized or ends far off-road, route to the
   * next-nearest vertices too and keep the lowest score.
   */
  async refineArrival(
    coordinates: Coordinate[],
    selected: IntersectionSelectionResult
  ): Promise<IntersectionSelectionResult> {
    const { intersection, route, nearestCoordinate } = selected;
    const needsRetry =
      routePenaltyMeters(route, intersection) > 0 ||
      offRoadMeters(route, nearestCoordinate) > ARRIVAL_RETRY_OFFROAD_METERS;
    if (!needsRetry) return selected;

    const seen = new Set<string>([coordinateKey(nearestCoordinate)]);
    const alternatives = [...coordinates]
      .sort((a, b) => geoMeasure(intersection, a).distanceMeters - geoMeasure(intersection, b).distanceMeters)
      .filter((c) => {
        const key = coordinateKey(c);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, ARRIVAL_ALTERNATIVES)
      .filter(
        (v) => !route.endLocation || geoMeasure(intersection, v).distanceMeters <= selected.score + ROUTE_BOUND_SLACK_METERS
      );

    const tried = await Promise.all(
      alternatives.map(async (vertex) => {
        const r = await this.computeRoute(intersection, vertex, geoMeasure(intersection, vertex).bearingDegrees);
        return r ? { intersection, nearestCoordinate: vertex, route: r, score: selectionScore(r, intersection, vertex) } : null;
      })
    );
    return tried.reduce<IntersectionSelectionResult>((best, t) => (t && t.score < best.score ? t : best), selected);
  }

  /**
   * The nearest snapped vertex on a local road other than `primaryStreet`. A
   * freeway snap finds only interchanges; this gives the search a second origin.
   */
  private async localRoadOrigin(
    coordinates: Coordinate[],
    snappedPoints: SnappedPoint[],
    primaryStreet: string | null
  ): Promise<{ location: Coordinate; street: string } | null> {
    const bySnapDistance = [...snappedPoints].sort(
      (a, b) =>
        geoMeasure(coordinates[a.originalIndex], a.location).distanceMeters -
        geoMeasure(coordinates[b.originalIndex], b.location).distanceMeters
    );
    const tried = new Set<string>();
    for (const sp of bySnapDistance) {
      const key = coordinateKey(sp.location);
      if (tried.has(key)) continue;
      tried.add(key);
      if (tried.size > 4) break;
      const street = (await this.reverseGeocode(sp.location.lat, sp.location.lng))?.street;
      if (street && street !== primaryStreet && !isLimitedAccessRoad(street)) {
        return { location: sp.location, street };
      }
    }
    return null;
  }

  /**
   * The chosen route already passes crossings nearer the site; start there, and
   * repeat from each improvement (each walks further down the route).
   */
  private async walkRouteJunctions(
    coordinates: Coordinate[],
    selected: IntersectionSelectionResult | null,
    locality: { city?: string; stateCode?: string }
  ): Promise<IntersectionSelectionResult | null> {
    let current = selected;
    for (let round = 0; round < JUNCTION_WALK_ROUNDS; round++) {
      if (!current || current.score <= ROAD_NAME_SEARCH_ABOVE_METERS) break;
      const next = betterSelection(
        current,
        await this.routeCandidates(coordinates, await this.routeJunctionCandidates(coordinates, current, locality))
      );
      if (next === current) break;
      current = next;
    }
    return current;
  }

  /** The last few junctions on `selected`'s route, confirmed by geocoding their road pair. */
  private async routeJunctionCandidates(
    coordinates: Coordinate[],
    selected: IntersectionSelectionResult,
    locality: { city?: string; stateCode?: string }
  ): Promise<Intersection[]> {
    const junctions = routeJunctions(selected.route).slice(0, ROUTE_JUNCTIONS_TRIED);
    const found = await Promise.all(
      junctions.map(async ({ roads, at }) => {
        const ix = await this.geocodeIntersection(`${roads[0]} & ${roads[1]}`, {
          area: coordinates,
          city: locality.city,
          stateCode: locality.stateCode,
        });
        if (!ix) return null;
        return !at || geoMeasure(ix, at).distanceMeters <= JUNCTION_MATCH_METERS ? ix : null;
      })
    );
    return found.filter((ix): ix is Intersection => ix !== null);
  }

  /** GeoNames nodes on rings past its 1 km search cap, the nearest few validated. */
  private async ringCandidates(coordinates: Coordinate[]): Promise<Intersection[]> {
    const center = polygonCentroid(coordinates);
    for (const radiusKm of RING_RADII_KM) {
      const nodes = new Map<string, GeoNamesCandidate>();
      for (const point of ringPoints(center, radiusKm, RING_POINTS)) {
        for (const node of await fetchIntersectionNodes(this.geonamesUsername, point, { maxRows: 3, radiusKm: 1 })) {
          nodes.set(`${node.street1}|${node.street2}`.toLowerCase(), node);
        }
      }
      if (nodes.size === 0) continue;
      const nearest = [...nodes.values()]
        .map((node) => ({ node, d: distanceToArea({ lat: parseFloat(node.lat), lng: parseFloat(node.lng) }, coordinates) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, DEFAULT_MAX_CANDIDATES)
        .map((x) => x.node);
      return validateIntersectionNodes(this.googleApiKey, nearest);
    }
    return [];
  }

  /**
   * Last resort where GeoNames has no data: collect the road names Google knows
   * around the site and geocode each pair as an intersection.
   */
  private async roadNamePairCandidates(
    coordinates: Coordinate[],
    snappedPoints: SnappedPoint[],
    locality: { city?: string; stateCode?: string }
  ): Promise<Intersection[]> {
    const center = polygonCentroid(coordinates);
    const vertices = dedupeCoordinates(coordinates).slice(0, MAX_PROBE_VERTICES);
    // Nearest first, so the pair cap keeps the likeliest crossings: the site's own
    // roads, then just outside each corner (where cross streets meet them), then a ring.
    const probes = [
      ...dedupeCoordinates(snappedPoints.map((sp) => sp.location)).slice(0, MAX_PROBE_VERTICES),
      ...vertices,
      ...vertices.map((v) => pointBeyond(center, v, 75)),
      ...vertices.map((v) => pointBeyond(center, v, 250)),
      ...ringPoints(center, 0.75, RING_POINTS),
    ];
    // In order, a batch at a time, until enough names exist to fill the pairs.
    const roads: Array<ReverseGeocodeResult | null> = [];
    for (let i = 0; i < probes.length; i += PROBE_CONCURRENCY) {
      const batch = probes.slice(i, i + PROBE_CONCURRENCY);
      roads.push(...(await Promise.all(batch.map((p) => this.reverseGeocode(p.lat, p.lng)))));
      if (eligibleRoadNames(roads.map((r) => r?.street ?? "")).length >= ROAD_NAMES_NEEDED) break;
    }
    const names = roads.map((r) => r?.street ?? "").filter(Boolean);
    const pairs = roadNamePairs(names, MAX_ROAD_NAME_PAIRS);
    const found = await mapLimit(pairs, PROBE_CONCURRENCY, ([a, b]) =>
      this.geocodeIntersection(`${a} & ${b}`, { area: coordinates, city: locality.city, stateCode: locality.stateCode })
    );
    const unique = new Map<string, Intersection>();
    for (const ix of found) if (ix) unique.set(`${ix.lat.toFixed(5)},${ix.lng.toFixed(5)}`, ix);
    return [...unique.values()];
  }

  async processSite(
    coordinates: Coordinate[],
    options?: ProcessSiteOptions
  ): Promise<SiteResult> {
    const intersectionOverride = options?.intersectionOverride;

    // Step 1: Snap to nearest road (best-effort). The Roads API only snaps
    // points within a tight tolerance of a mapped road, so a work area on raw
    // land / new construction can return nothing. That must not be fatal.
    let snappedPoints: SnappedPoint[];
    try {
      snappedPoints = await this.findNearestRoadPoint(coordinates);
    } catch (err) {
      // Empty snap is expected for far-from-road sites; a 403/network error also
      // lands here. Log so a key/config problem isn't silently masked by the fallback.
      console.warn(
        `findNearestRoadPoint failed; falling back to reverse-geocode: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      snappedPoints = [];
    }

    // Find closest snapped point to original coordinates
    let bestDist = Infinity;
    let bestOriginal: Coordinate | null = null;
    let bestSnapped: Coordinate | null = null;

    for (const sp of snappedPoints) {
      const orig = coordinates[sp.originalIndex];
      const { distanceMeters } = geoMeasure(orig, sp.location);
      if (distanceMeters < bestDist) {
        bestDist = distanceMeters;
        bestOriginal = orig;
        bestSnapped = sp.location;
      }
    }

    // Fallback when snapping found nothing: reverse-geocode the polygon centroid.
    // Google reverse geocoding has a far wider range than Roads snapping and
    // returns the matched road feature's own location, so it pulls a far-from-road
    // work area onto the nearest road. The intersection search then runs from that
    // on-road point — exactly where a successful snap would have centered it.
    let snapRoadInfo: ReverseGeocodeResult | null = null;
    if (!bestSnapped) {
      if (coordinates.length === 0) {
        throw new Error("Could not match any snapped point to original coordinates");
      }
      const centroid = polygonCentroid(coordinates);
      snapRoadInfo = await this.reverseGeocode(centroid.lat, centroid.lng);
      if (!snapRoadInfo) {
        throw new Error("Work area is not near any locatable road; provide a nearby intersection manually");
      }
      bestSnapped = { lat: snapRoadInfo.lat, lng: snapRoadInfo.lng };
      const nearest = nearestCoordinateToTarget(coordinates, bestSnapped);
      bestOriginal = nearest ? nearest.coordinate : coordinates[0];
    }

    if (!bestOriginal || !bestSnapped) {
      throw new Error("Could not match any snapped point to original coordinates");
    }

    // Step 2: Identify road at snap point (reuse the fallback reverse-geocode).
    if (!snapRoadInfo) {
      snapRoadInfo = await this.reverseGeocode(bestSnapped.lat, bestSnapped.lng);
    }
    let snapStreet = snapRoadInfo?.street ?? null;

    // Step 3: Find intersection
    let intersection: Intersection | null = null;
    let startCoordinate: Coordinate | null = null;
    let routeResult: RouteResult | null = null;

    if (intersectionOverride) {
      intersection = await this.geocodeIntersection(intersectionOverride, {
        area: coordinates,
        city: snapRoadInfo?.city,
        stateCode: snapRoadInfo?.stateCode,
      });
      if (!intersection) {
        throw new Error(
          `Intersection override "${intersectionOverride}" could not be geocoded near the work area`
        );
      }
    }

    if (intersection) {
      const nearest = nearestCoordinateToTarget(coordinates, intersection);
      if (!nearest) throw new Error("No coordinates provided");
      startCoordinate = nearest.coordinate;
      const { bearingDegrees: heading } = geoMeasure(intersection, startCoordinate);
      routeResult = await this.computeRoute(intersection, startCoordinate, heading);
      if (!routeResult) throw new Error("Could not compute route from intersection to site");
      const refined = await this.refineArrival(coordinates, {
        intersection,
        nearestCoordinate: startCoordinate,
        route: routeResult,
        score: selectionScore(routeResult, intersection, startCoordinate),
      });
      startCoordinate = refined.nearestCoordinate;
      routeResult = refined.route;
    } else {
      let selected = await this.selectShortestRouteIntersection(coordinates, {
        snappedPoint: bestSnapped,
        preferredRoad: snapStreet ?? undefined,
      });

      // Penalized means interchange, ramp, toll or U-turn: often a freeway snap
      // that found only interchanges. Search again from the nearest local road.
      if (!selected || routePenaltyMeters(selected.route, selected.intersection) > 0) {
        const local = await this.localRoadOrigin(coordinates, snappedPoints, snapStreet);
        if (local) {
          selected = betterSelection(
            selected,
            await this.selectShortestRouteIntersection(coordinates, {
              snappedPoint: local.location,
              preferredRoad: local.street,
            })
          );
        }
      }

      // Lazy fallback: the tightest-snap point can land on an interior street
      // that has no mapped intersection within range (new subdivisions), while
      // the work area's bounding roads do. Working sites never reach this path.
      if (!selected) {
        for (const origin of boundingBoxExtremeOrigins(coordinates, snappedPoints, bestSnapped)) {
          selected = betterSelection(
            selected,
            await this.selectShortestRouteIntersection(coordinates, { snappedPoint: origin })
          );
        }
      }

      if (!selected) {
        selected = await this.routeCandidates(coordinates, await this.ringCandidates(coordinates));
      }
      const locality = { city: snapRoadInfo?.city, stateCode: snapRoadInfo?.stateCode };
      selected = await this.walkRouteJunctions(coordinates, selected, locality);

      if (!selected || selected.score > ROAD_NAME_SEARCH_ABOVE_METERS) {
        selected = betterSelection(
          selected,
          await this.routeCandidates(
            coordinates,
            await this.roadNamePairCandidates(coordinates, snappedPoints, locality)
          )
        );
        selected = await this.walkRouteJunctions(coordinates, selected, locality);
      }

      if (!selected) throw new Error("No nearby intersection could be determined automatically; provide a nearby intersection manually");

      intersection = selected.intersection;
      startCoordinate = selected.nearestCoordinate;
      routeResult = selected.route;
    }

    // Step 4: Rotate coordinates to start from the nearest coordinate to the chosen intersection
    const orderedCoordinates = rotateCoordinatesToStart(coordinates, startCoordinate);
    startCoordinate = orderedCoordinates[0];

    // Step 5: Fallback street name extraction
    if (!snapStreet) {
      const { onto } = extractTurnStreets(routeResult.steps);
      if (onto) snapStreet = onto;
    }

    // Fill missing address components from reverse geocode
    if (snapRoadInfo) {
      intersection = {
        ...intersection,
        county: intersection.county || snapRoadInfo.county || "",
        city: intersection.city || snapRoadInfo.city || "",
        state: intersection.state || snapRoadInfo.state || "",
        stateCode: intersection.stateCode || snapRoadInfo.stateCode || "",
        zip: intersection.zip || snapRoadInfo.zip || "",
      };
    }

    // Compute the off-road final approach: how far the arrival boundary point
    // sits from the nearest road. A driving route ends at the road, so this is
    // the only place the "leave the road and enter the site" leg is captured.
    // Measured from where the drive stops. A reverse-geocode result's location is
    // the matched feature's point (often mid-road), which overstated a 160 ft walk
    // as 2,763 ft on a 495-acre site.
    // The road name is only printed with an off-road line, so it is looked up only then.
    let finalApproach: { distanceFeet: number; cardinal: string; roadName?: string } | undefined;
    const driveEnd = routeResult.endLocation;
    const fallbackRoad = driveEnd ? null : await this.reverseGeocode(startCoordinate.lat, startCoordinate.lng);
    const roadPoint = driveEnd ?? (fallbackRoad ? { lat: fallbackRoad.lat, lng: fallbackRoad.lng } : null);
    if (roadPoint) {
      const { distanceMeters, bearingDegrees } = geoMeasure(roadPoint, startCoordinate);
      if (distanceMeters > 30) {
        const arrivalRoad = driveEnd ? await this.reverseGeocode(driveEnd.lat, driveEnd.lng) : fallbackRoad;
        finalApproach = {
          distanceFeet: Math.round(distanceMeters * 3.28084),
          cardinal: bearingToCardinal(bearingDegrees),
          roadName: arrivalRoad?.street,
        };
      }
    }

    // Step 6: Format output
    const directionsText = formatDirections(intersection, startCoordinate, routeResult, orderedCoordinates, finalApproach);
    const markingText = formatMarkingText(orderedCoordinates);
    const areaAcres = polygonAreaAcres(orderedCoordinates);
    const boundingBox = boundingBoxFeet(orderedCoordinates);

    return {
      coordinates: orderedCoordinates,
      intersection,
      workLocality: ticketLocality(snapRoadInfo, intersection),
      routeMeters: routeResult.distanceMeters,
      directionsText,
      markingText,
      areaAcres,
      boundingBox,
    };
  }
}
