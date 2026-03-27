import type {
  ClientConfig,
  Coordinate,
  FindIntersectionOptions,
  Intersection,
  ProcessSiteOptions,
  ReverseGeocodeResult,
  RouteResult,
  SiteResult,
  SnappedPoint,
} from "./types.js";
import {
  findNearestRoadPoint as apiFindNearestRoadPoint,
  reverseGeocode as apiReverseGeocode,
  geocodeIntersection as apiGeocodeIntersection,
  computeRoute as apiComputeRoute,
} from "./api/google.js";
import { findNearestIntersection as apiFindNearestIntersection } from "./api/geonames.js";
import { geoMeasure } from "./geo/measure.js";
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

  async processSite(
    coordinates: Coordinate[],
    options?: ProcessSiteOptions
  ): Promise<SiteResult> {
    const intersectionOverride = options?.intersectionOverride;

    // Step 1: Snap to nearest road
    const snappedPoints = await this.findNearestRoadPoint(coordinates);

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

    if (!bestOriginal || !bestSnapped) {
      throw new Error("Could not match any snapped point to original coordinates");
    }

    // Step 2: Identify road at snap point
    const snapRoadInfo = await this.reverseGeocode(bestSnapped.lat, bestSnapped.lng);
    let snapStreet = snapRoadInfo?.street ?? null;

    // Step 3: Find intersection
    let intersection: Intersection | null = null;

    if (intersectionOverride) {
      intersection = await this.geocodeIntersection(intersectionOverride);
    }

    if (!intersection) {
      // Scout: find nearest intersection and compute a route to identify the approach
      const scoutIntersection = await this.findNearestIntersection(
        bestSnapped.lat,
        bestSnapped.lng,
        { preferredRoad: snapStreet ?? undefined }
      );
      if (!scoutIntersection) throw new Error("No intersection found near snapped road point");

      const { bearingDegrees: scoutHeading } = geoMeasure(scoutIntersection, bestOriginal);
      const scoutResult = await this.computeRoute(scoutIntersection, bestOriginal, scoutHeading);
      if (!scoutResult) throw new Error("Could not compute scout route");

      const scoutDistance = scoutResult.distanceMeters;

      // Find last turn in scout route
      let lastTurn: Coordinate | null = null;
      for (let i = scoutResult.steps.length - 1; i >= 0; i--) {
        const maneuver = scoutResult.steps[i].navigationInstruction?.maneuver ?? "";
        if (maneuver === "TURN_LEFT" || maneuver === "TURN_RIGHT") {
          const loc = scoutResult.steps[i].startLocation?.latLng;
          if (loc) {
            lastTurn = { lat: loc.latitude, lng: loc.longitude };
          }
          break;
        }
      }

      // Re-query at last turn for better intersection
      if (lastTurn) {
        const turnIntersection = await this.findNearestIntersection(
          lastTurn.lat,
          lastTurn.lng,
          { preferredRoad: snapStreet ?? undefined }
        );
        if (turnIntersection) {
          const { bearingDegrees: turnHeading } = geoMeasure(turnIntersection, bestOriginal);
          const turnResult = await this.computeRoute(turnIntersection, bestOriginal, turnHeading);
          if (turnResult && turnResult.distanceMeters < scoutDistance) {
            intersection = turnIntersection;
          } else {
            intersection = scoutIntersection;
          }
        } else {
          intersection = scoutIntersection;
        }
      } else {
        intersection = scoutIntersection;
      }
    }

    if (!intersection) throw new Error("Failed to determine intersection");

    // Step 4: Re-select nearest boundary point to intersection
    bestDist = Infinity;
    bestOriginal = null;
    for (const coord of coordinates) {
      const { distanceMeters } = geoMeasure(intersection, coord);
      if (distanceMeters < bestDist) {
        bestDist = distanceMeters;
        bestOriginal = coord;
      }
    }
    if (!bestOriginal) throw new Error("Could not find nearest boundary point");
    const orderedCoordinates = rotateCoordinatesToStart(coordinates, bestOriginal);
    const startCoordinate = orderedCoordinates[0];

    // Step 5: Compute final route
    const { bearingDegrees: heading } = geoMeasure(intersection, startCoordinate);
    const routeResult = await this.computeRoute(intersection, startCoordinate, heading);
    if (!routeResult) throw new Error("Could not compute route from intersection to site");

    // Step 6: Fallback street name extraction
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

    // Step 7: Format output
    const directionsText = formatDirections(intersection, startCoordinate, routeResult, orderedCoordinates);
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
