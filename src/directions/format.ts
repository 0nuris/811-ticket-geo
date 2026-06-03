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

export interface FinalApproach {
  distanceFeet: number;
  cardinal: string;
  roadName?: string;
}

/** Builds the "DIRECTIONS from {intersection} to {lat}, {lng}" opening line. */
function buildDirectionsHeader(intersection: Intersection, destination: Coordinate): string {
  const { city, stateCode, zip, name } = intersection;

  const addressParts = [name];
  if (city) addressParts.push(city);
  if (stateCode && zip) addressParts.push(`${stateCode} ${zip}`);
  else if (stateCode) addressParts.push(stateCode);
  const directionsFrom = addressParts.join(", ");

  return `DIRECTIONS from ${directionsFrom} to ${destination.lat}, ${destination.lng}`;
}

/**
 * Renders a Google route into numbered turn-by-turn lines, with the same
 * cardinal-correction logic the auto flow uses (open-heading alignment + an
 * appended heading for instructions that lack a cardinal). `destination` is the
 * off-road fallback heading target for the last step.
 */
function renderRouteSteps(route: RouteResult, destination: Coordinate): string[] {
  const lines: string[] = [];
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
    const nextStepLocation = i + 1 < stepLocations.length ? stepLocations[i + 1] : null;
    const hasUturn = instruction.toLowerCase().includes("u-turn");

    if (i === 0 && !hasUturn && hasCardinal(instruction) && currentLocation && nextStepLocation) {
      // Align the opening heading with the first road segment (start -> next
      // maneuver). Never aim it at an off-road destination vertex, so a single
      // -step route keeps Google's road-accurate cardinal.
      const { bearingDegrees } = geoMeasure(currentLocation, nextStepLocation);
      instruction = replaceCardinal(instruction, bearingToCardinal(bearingDegrees));
    } else if (!hasCardinal(instruction)) {
      const headingTarget = nextStepLocation ?? destination;
      if (currentLocation && headingTarget) {
        const { bearingDegrees } = geoMeasure(currentLocation, headingTarget);
        instruction = `${instruction} heading ${bearingToCardinal(bearingDegrees)}`;
      }
    }

    const locVals = step.localizedValues ?? {};
    const dist = locVals.distance?.text ?? "";
    const dur = locVals.duration?.text ?? "";
    const suffix = [dist, dur].filter(Boolean).join(", ");
    lines.push(`${i + 1}. ${instruction} (${suffix})`);
  }

  return lines;
}

/** Google-style distance: feet under 1000, otherwise miles to one decimal. */
function formatStepDistance(meters: number): string {
  const feet = meters * METERS_TO_FEET;
  return feet >= 1000 ? `${(feet / 5280).toFixed(1)} mi` : `${Math.round(feet)} ft`;
}

/** Trims a coordinate to ~0.1 m precision for readable step targets. */
function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// A heading change beyond this many degrees (from a step's opening heading)
// starts a new on-site step; gentler bends stay within the current step.
const ONSITE_STEP_TURN_DEGREES = 45;

/** Smallest angle between two bearings, 0..180. */
function angularDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

interface RouteStepGroup {
  start: Coordinate;
  end: Coordinate;
  meters: number;        // distance traveled along the merged segments (counts bends)
  anchorBearing: number; // heading of the step's first segment
}

/**
 * Collapses a hand-mapped point path into directional steps: consecutive
 * segments whose heading stays within `turnThreshold` of the step's opening
 * heading merge into one step (distance summed along the path), so a foreman can
 * trace a curved road with many points without producing a step per point.
 */
function groupRouteSteps(path: Coordinate[], turnThreshold: number): RouteStepGroup[] {
  const groups: RouteStepGroup[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const { distanceMeters, bearingDegrees } = geoMeasure(a, b);
    const current = groups[groups.length - 1];
    if (current && angularDifference(bearingDegrees, current.anchorBearing) <= turnThreshold) {
      current.meters += distanceMeters;
      current.end = b;
    } else {
      groups.push({ start: a, end: b, meters: distanceMeters, anchorBearing: bearingDegrees });
    }
  }
  return groups;
}

/** Renders the closing area/bounding-box/marking lines from the polygon. */
function renderAreaTrailer(coordinates: Coordinate[]): string[] {
  const area = polygonAreaAcres(coordinates);
  const bbox = boundingBoxFeet(coordinates);
  return [
    "",
    `Area: ${area.toFixed(1)} acres`,
    `Bounding Box: ${Math.round(bbox.northSouthFeet)} feet (North-South) by ${Math.round(bbox.eastWestFeet)} feet (East-West)`,
    "",
    "Important Mark Utilities along and within the polygon boundary.",
    "Bounding box dimensions are for reference only - use polygon coordinates below.",
  ];
}

export function formatDirections(
  intersection: Intersection,
  destination: Coordinate,
  route: RouteResult,
  coordinates: Coordinate[],
  finalApproach?: FinalApproach
): string {
  const directionsLines = [buildDirectionsHeader(intersection, destination), ""];

  directionsLines.push(...renderRouteSteps(route, destination));

  // The work area is often set back from the roadway (a drive route can't
  // express the final off-road leg). Spell it out so the locator knows to leave
  // the road and enter the site.
  if (finalApproach && finalApproach.distanceFeet > 0) {
    const off = finalApproach.roadName ? ` off ${finalApproach.roadName}` : " off the roadway";
    directionsLines.push(
      `${route.steps.length + 1}. Work area is about ${finalApproach.distanceFeet} ft ${finalApproach.cardinal}${off} - leave the road and enter the site (off-road).`
    );
  }

  directionsLines.push(...renderAreaTrailer(coordinates));

  return directionsLines.join("\n");
}

export interface ManualDirectionsArgs {
  /** Validated entrance intersection (the route origin). */
  intersection: Intersection;
  /** Auto-computed route from the intersection to the entrance/gate. */
  autoLeg: RouteResult;
  /** The entrance/gate coordinate the auto leg ends at. */
  entrance: Coordinate;
  /**
   * Ordered, hand-mapped waypoints from the entrance/gate to the work area.
   * The last waypoint is the chosen polygon vertex (authoritative destination).
   */
  waypoints: Coordinate[];
  /** Full work-area polygon, used for the area/bounding-box trailer. */
  polygon: Coordinate[];
}

/**
 * Assembles the combined manual directions for a restricted-access site:
 * the auto intersection->gate leg (numbered, Google turn-by-turn) followed by
 * the hand-mapped gate->polygon leg (per-step cardinal + distance, in the
 * formatMarkingText style). Pure: identical inputs always yield identical text,
 * so a dry-run preview matches the submitted ticket byte-for-byte.
 */
export function formatManualDirections({
  intersection,
  autoLeg,
  entrance,
  waypoints,
  polygon,
}: ManualDirectionsArgs): string {
  const lines = [buildDirectionsHeader(intersection, entrance), ""];

  lines.push(...renderRouteSteps(autoLeg, entrance));

  lines.push("");
  lines.push("Entrance/gate reached - proceed on-site to the work area:");

  // Off-road steps in Google's numbered turn-by-turn style, continuing the auto
  // leg's numbering. Many same-heading points collapse into one step (distance
  // summed along the bends); a new step starts only on a real turn. There are no
  // road names off-road, so each step keeps its target coordinate for GPS.
  const onSiteStart = autoLeg.steps.length;
  const groups = groupRouteSteps([entrance, ...waypoints], ONSITE_STEP_TURN_DEGREES);
  groups.forEach((group, i) => {
    const direction = bearingToCardinal(geoMeasure(group.start, group.end).bearingDegrees);
    const distance = formatStepDistance(group.meters);
    const lat = roundCoordinate(group.end.lat);
    const lng = roundCoordinate(group.end.lng);
    const isLast = i === groups.length - 1;
    const target = isLast ? `the work area at ${lat}, ${lng}` : `${lat}, ${lng}`;
    lines.push(`${onSiteStart + i + 1}. Head ${direction} (${distance}) to ${target}`);
  });

  lines.push(...renderAreaTrailer(polygon));

  return lines.join("\n");
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
