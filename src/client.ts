import type {
  ClientConfig,
  Coordinate,
  FindIntersectionOptions,
  Intersection,
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
} from "./api/geonames.js";
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

  constructor(config: ClientConfig) {
    this.googleApiKey = config.googleMapsApiKey;
    this.geonamesUsername = config.geonamesUsername;
  }

  async findNearestRoadPoint(coordinates: Coordinate[]): Promise<SnappedPoint[]> {
    const result = await apiFindNearestRoadPoint(this.googleApiKey, coordinates);
    if (!result) throw new Error("Roads API returned no snapped points");
    return result;
  }

  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    return apiReverseGeocode(this.googleApiKey, lat, lng);
  }

  async geocodeIntersection(address: string): Promise<Intersection | null> {
    return apiGeocodeIntersection(this.googleApiKey, address);
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
    return apiComputeRoute(this.googleApiKey, origin, destination, heading);
  }

  /**
   * Selects the intersection with the shortest routed distance among a
   * single candidate from each populated quadrant around the snapped point.
   *
   * Strategy: Query GeoNames for candidate intersections within radiusKm of the
   * snapped road point, then select the nearest candidate from each cardinal
   * quadrant (N/E/S/W) relative to the snap point. This ensures geographic
   * coverage — a linearly closer intersection may have a longer driving route
   * due to road topology (highway barriers, one-way streets, etc.). Each
   * selected candidate is routed to its nearest polygon vertex; the shortest
   * route wins.
   *
   * This quadrant-based heuristic intentionally limits routed candidates to
   * reduce false positives caused by rivers, dead ends, and other topology
   * quirks. A previous scout-and-requery approach could discover intersections
   * beyond radiusKm, but was less deterministic and harder to reason about.
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

    const preferredRoad = options?.preferredRoad
      ?? (await this.reverseGeocode(snappedPoint.lat, snappedPoint.lng))?.street;

    const candidates = await apiFindIntersectionCandidates(
      this.googleApiKey,
      this.geonamesUsername,
      snappedPoint.lat,
      snappedPoint.lng,
      {
        preferredRoad,
        maxCandidates: options?.maxCandidates,
        radiusKm: options?.radiusKm,
      }
    );

    // Select the nearest candidate from each cardinal quadrant (N/E/S/W)
    // to ensure geographic coverage — a linearly closer intersection may
    // have a longer driving route due to road topology.
    const quadrants = new Map<number, { candidate: Intersection; nearest: { coordinate: Coordinate; distanceMeters: number } }>();

    for (const candidate of candidates) {
      const nearest = nearestCoordinateToTarget(coordinates, candidate);
      if (!nearest) continue;

      const { bearingDegrees } = geoMeasure(snappedPoint, candidate);
      const quadrant = Math.floor(((bearingDegrees + 45) % 360) / 90);

      const existing = quadrants.get(quadrant);
      if (!existing || nearest.distanceMeters < existing.nearest.distanceMeters) {
        quadrants.set(quadrant, { candidate, nearest });
      }
    }

    const toRoute = Array.from(quadrants.values());

    let bestResult: IntersectionSelectionResult | null = null;
    let bestLinearDistance = Infinity;

    for (const { candidate, nearest } of toRoute) {
      const { bearingDegrees: heading } = geoMeasure(candidate, nearest.coordinate);
      const route = await this.computeRoute(candidate, nearest.coordinate, heading);
      if (!route) continue;

      const isBetterRoute = !bestResult || route.distanceMeters < bestResult.route.distanceMeters;
      const isSameRouteButNearer =
        !!bestResult &&
        Math.abs(route.distanceMeters - bestResult.route.distanceMeters) < 10 &&
        nearest.distanceMeters < bestLinearDistance;

      if (isBetterRoute || isSameRouteButNearer) {
        bestResult = {
          intersection: candidate,
          nearestCoordinate: nearest.coordinate,
          route,
        };
        bestLinearDistance = nearest.distanceMeters;
      }
    }

    return bestResult;
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
      intersection = await this.geocodeIntersection(intersectionOverride);
      if (!intersection) {
        throw new Error(
          `Intersection override "${intersectionOverride}" could not be geocoded`
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
    } else {
      let selected = await this.selectShortestRouteIntersection(coordinates, {
        snappedPoint: bestSnapped,
        preferredRoad: snapStreet ?? undefined,
      });

      // Lazy fallback: the tightest-snap point can land on an interior street
      // that has no mapped intersection within range (new subdivisions), while
      // the work area's bounding roads do. Only when the primary search comes
      // back empty, retry from the bounding-box extreme vertices and keep the
      // shortest routed result. Working sites never reach this path.
      if (!selected) {
        let bestRouteMeters = Infinity;
        for (const origin of boundingBoxExtremeOrigins(coordinates, snappedPoints, bestSnapped)) {
          const candidate = await this.selectShortestRouteIntersection(coordinates, {
            snappedPoint: origin,
          });
          if (candidate && candidate.route.distanceMeters < bestRouteMeters) {
            selected = candidate;
            bestRouteMeters = candidate.route.distanceMeters;
          }
        }
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
    let finalApproach: { distanceFeet: number; cardinal: string; roadName?: string } | undefined;
    const arrivalRoad = await this.reverseGeocode(startCoordinate.lat, startCoordinate.lng);
    if (arrivalRoad) {
      const { distanceMeters, bearingDegrees } = geoMeasure(
        { lat: arrivalRoad.lat, lng: arrivalRoad.lng },
        startCoordinate
      );
      if (distanceMeters > 30) {
        finalApproach = {
          distanceFeet: Math.round(distanceMeters * 3.28084),
          cardinal: bearingToCardinal(bearingDegrees),
          roadName: arrivalRoad.street,
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
      directionsText,
      markingText,
      areaAcres,
      boundingBox,
    };
  }
}
