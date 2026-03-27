import type { Coordinate, Intersection, RouteResult } from "../types.js";
import { geoMeasure, bearingToCardinal } from "../geo/measure.js";
import { polygonAreaAcres, boundingBoxFeet } from "../geo/area.js";

const METERS_TO_FEET = 3.28084;

const CARDINAL_KEYWORDS = new Set([
  "north", "south", "east", "west",
  "northeast", "northwest", "southeast", "southwest",
]);

function hasCardinal(text: string): boolean {
  const lower = text.toLowerCase();
  return [...CARDINAL_KEYWORDS].some((kw) => lower.includes(kw));
}

function replaceCardinal(text: string, replacement: string): string {
  const lower = text.toLowerCase();
  const sorted = [...CARDINAL_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    const pos = lower.indexOf(kw);
    if (pos !== -1) {
      return text.slice(0, pos) + replacement + text.slice(pos + kw.length);
    }
  }
  return text;
}

function coordinatesEqual(a: Coordinate, b: Coordinate): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

function normalizeLoopCoordinates(coordinates: Coordinate[]): Coordinate[] {
  if (
    coordinates.length > 1 &&
    coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])
  ) {
    return coordinates.slice(0, -1);
  }

  return coordinates;
}

export function formatDirections(
  intersection: Intersection,
  destination: Coordinate,
  route: RouteResult,
  coordinates: Coordinate[]
): string {
  const { city, stateCode, zip, name } = intersection;

  const addressParts = [name];
  if (city) addressParts.push(city);
  if (stateCode && zip) addressParts.push(`${stateCode} ${zip}`);
  else if (stateCode) addressParts.push(stateCode);
  const directionsFrom = addressParts.join(", ");

  const directionsLines = [
    `DIRECTIONS from ${directionsFrom} to ${destination.lat}, ${destination.lng}`,
    "",
  ];

  const steps = route.steps;
  const stepLocations: (Coordinate | null)[] = steps.map((step) => {
    const loc = step.startLocation?.latLng;
    return loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  });

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nav = step.navigationInstruction ?? {};
    let instruction = (nav.instructions ?? "Continue").replace(/\n/g, " - ");

    const currentLocation = stepLocations[i];
    const nextLocation = i + 1 < stepLocations.length ? stepLocations[i + 1] : destination;
    const canCompute = currentLocation !== null && nextLocation !== null;
    const hasUturn = instruction.toLowerCase().includes("u-turn");

    if (canCompute && currentLocation && nextLocation) {
      const { bearingDegrees } = geoMeasure(currentLocation, nextLocation);
      const cardinal = bearingToCardinal(bearingDegrees);

      if (i === 0 && !hasUturn && hasCardinal(instruction)) {
        instruction = replaceCardinal(instruction, cardinal);
      } else if (!hasCardinal(instruction)) {
        instruction = `${instruction} heading ${cardinal}`;
      }
    }

    const locVals = step.localizedValues ?? {};
    const dist = locVals.distance?.text ?? "";
    const dur = locVals.duration?.text ?? "";
    const suffix = [dist, dur].filter(Boolean).join(", ");
    directionsLines.push(`${i + 1}. ${instruction} (${suffix})`);
  }

  const area = polygonAreaAcres(coordinates);
  const bbox = boundingBoxFeet(coordinates);
  directionsLines.push("");
  directionsLines.push(`Area: ${area.toFixed(1)} acres`);
  directionsLines.push(
    `Bounding Box: ${Math.round(bbox.northSouthFeet)} feet (North-South) by ${Math.round(bbox.eastWestFeet)} feet (East-West)`
  );
  directionsLines.push("");
  directionsLines.push("Important Mark Utilities along and within the polygon boundary.");
  directionsLines.push("Bounding box dimensions are for reference only - use polygon coordinates below.");

  return directionsLines.join("\n");
}

export function formatMarkingText(coordinates: Coordinate[]): string {
  const loopCoordinates = normalizeLoopCoordinates(coordinates);
  const n = loopCoordinates.length;
  const lines = [
    `WORK AREA BOUNDARIES (${n} points)`,
  ];

  const start = loopCoordinates[0];
  lines.push(`Start: ${start.lat}, ${start.lng}`);

  for (let j = 1; j <= n; j++) {
    const prev = loopCoordinates[j - 1];
    const curr = loopCoordinates[j % n];
    const { distanceMeters, bearingDegrees } = geoMeasure(prev, curr);
    const cardinal = bearingToCardinal(bearingDegrees).toUpperCase();
    const distanceFeet = Math.round(distanceMeters * METERS_TO_FEET);
    lines.push(`    -> ${cardinal} ${distanceFeet} ft to ${curr.lat}, ${curr.lng}`);
  }

  lines.push(`Returns to start point (${start.lat}, ${start.lng})`);
  return lines.join("\n");
}
