"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  MAX_INTERSECTION_DISTANCE_METERS: () => MAX_INTERSECTION_DISTANCE_METERS,
  TicketGeoClient: () => TicketGeoClient,
  bearingToCardinal: () => bearingToCardinal,
  boundingBoxFeet: () => boundingBoxFeet,
  formatDirections: () => formatDirections,
  formatManualDirections: () => formatManualDirections,
  formatMarkingText: () => formatMarkingText,
  geoMeasure: () => geoMeasure,
  isLimitedAccessRoad: () => isLimitedAccessRoad,
  parseStreet: () => parseStreet,
  polygonAreaAcres: () => polygonAreaAcres,
  simplifyPolygon: () => simplifyPolygon,
  streetsMatch: () => streetsMatch,
  toPolygonWkt: () => toPolygonWkt
});
module.exports = __toCommonJS(index_exports);

// src/geo/measure.ts
function geoMeasure(from, to) {
  const toRad = (deg) => deg * Math.PI / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const deltaLat = toRad(to.lat - from.lat);
  const deltaLng = toRad(to.lng - from.lng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const distanceMeters = 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const x = Math.sin(deltaLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  const bearingDegrees = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  return { distanceMeters, bearingDegrees };
}
var CARDINALS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest"
];
function bearingToCardinal(degrees) {
  const index = Math.floor((degrees + 22.5) % 360 / 45);
  return CARDINALS[index];
}

// src/geo/area.ts
var METERS_TO_FEET = 3.28084;
var SQ_METERS_TO_ACRES = 1 / 4046.86;
function polygonAreaAcres(coordinates) {
  const n = coordinates.length;
  if (n < 3) return 0;
  const refLat = coordinates[0].lat;
  const refLng = coordinates[0].lng;
  const xs = [0];
  const ys = [0];
  for (let i = 1; i < n; i++) {
    const c = coordinates[i];
    const { distanceMeters: dy } = geoMeasure(
      { lat: refLat, lng: refLng },
      { lat: c.lat, lng: refLng }
    );
    const { distanceMeters: dx } = geoMeasure(
      { lat: refLat, lng: refLng },
      { lat: refLat, lng: c.lng }
    );
    xs.push(c.lng < refLng ? -dx : dx);
    ys.push(c.lat < refLat ? -dy : dy);
  }
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += xs[i] * ys[j] - xs[j] * ys[i];
  }
  return Math.abs(area) / 2 * SQ_METERS_TO_ACRES;
}
function boundingBoxFeet(coordinates) {
  if (coordinates.length === 0) return { northSouthFeet: 0, eastWestFeet: 0 };
  const lats = coordinates.map((c) => c.lat);
  const lngs = coordinates.map((c) => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const { distanceMeters: nsMeters } = geoMeasure(
    { lat: minLat, lng: midLng },
    { lat: maxLat, lng: midLng }
  );
  const { distanceMeters: ewMeters } = geoMeasure(
    { lat: midLat, lng: minLng },
    { lat: midLat, lng: maxLng }
  );
  return {
    northSouthFeet: nsMeters * METERS_TO_FEET,
    eastWestFeet: ewMeters * METERS_TO_FEET
  };
}

// src/geo/wkt.ts
function toPolygonWkt(coordinates) {
  if (coordinates.length === 0) return "POLYGON EMPTY";
  const pairs = coordinates.map((c) => `${c.lng} ${c.lat}`);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) {
    pairs.push(`${first.lng} ${first.lat}`);
  }
  return `POLYGON((${pairs.join(",")}))`;
}

// src/geo/simplify.ts
function cross2d(o, a, b) {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
}
function convexHull(points) {
  const sorted = [...points].sort(
    (a, b) => a.lng - b.lng || a.lat - b.lat
  );
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2d(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2d(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function visvalingam(coords, maxPoints) {
  const n = coords.length;
  if (n <= maxPoints) return coords;
  const prev = Array.from({ length: n }, (_, i2) => (i2 - 1 + n) % n);
  const next = Array.from({ length: n }, (_, i2) => (i2 + 1) % n);
  const alive = new Array(n).fill(true);
  const generation = new Array(n).fill(0);
  let size = n;
  function cornerArea(i2) {
    return Math.abs(cross2d(coords[prev[i2]], coords[i2], coords[next[i2]])) / 2;
  }
  const heap = [];
  function heapPush(entry) {
    heap.push(entry);
    let i2 = heap.length - 1;
    while (i2 > 0) {
      const parent = i2 - 1 >> 1;
      if (heap[parent][0] <= heap[i2][0]) break;
      [heap[parent], heap[i2]] = [heap[i2], heap[parent]];
      i2 = parent;
    }
  }
  function heapPop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i2 = 0;
      while (true) {
        let smallest = i2;
        const left = 2 * i2 + 1;
        const right = 2 * i2 + 2;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i2) break;
        [heap[smallest], heap[i2]] = [heap[i2], heap[smallest]];
        i2 = smallest;
      }
    }
    return top;
  }
  for (let i2 = 0; i2 < n; i2++) {
    heapPush([cornerArea(i2), generation[i2], i2]);
  }
  while (size > maxPoints && heap.length > 0) {
    const [area, gen, i2] = heapPop();
    if (!alive[i2] || gen !== generation[i2]) continue;
    const p = prev[i2];
    const nx = next[i2];
    next[p] = nx;
    prev[nx] = p;
    alive[i2] = false;
    size--;
    for (const nb of [p, nx]) {
      if (alive[nb]) {
        generation[nb]++;
        heapPush([cornerArea(nb), generation[nb], nb]);
      }
    }
  }
  const result = [];
  const start = alive.indexOf(true);
  let i = start;
  do {
    result.push(coords[i]);
    i = next[i];
  } while (i !== start);
  return result;
}
function signedArea(coords) {
  const origin = coords[0];
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    area += cross2d(origin, coords[i], coords[(i + 1) % coords.length]);
  }
  return area / 2;
}
function pointInPolygon(point, polygon) {
  const x = point.lng;
  const y = point.lat;
  const n = polygon.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
function enforceContainment(simplified, original) {
  const n = simplified.length;
  const ccw = signedArea(simplified) > 0;
  const normals = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = simplified[j].lng - simplified[i].lng;
    const dy = simplified[j].lat - simplified[i].lat;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) {
      normals.push([0, 0]);
    } else if (ccw) {
      normals.push([dy / length, -dx / length]);
    } else {
      normals.push([-dy / length, dx / length]);
    }
  }
  const edgeOffset = new Array(n).fill(0);
  for (const p of original) {
    if (pointInPolygon(p, simplified)) continue;
    for (let ei = 0; ei < n; ei++) {
      const a = simplified[ei];
      const [nx, ny] = normals[ei];
      const signedDist = (p.lng - a.lng) * nx + (p.lat - a.lat) * ny;
      if (signedDist > edgeOffset[ei]) {
        edgeOffset[ei] = signedDist;
      }
    }
  }
  const buffer = 3e-6;
  return simplified.map((vertex, i) => {
    const prevEdge = (i - 1 + n) % n;
    const currEdge = i;
    let dlng = 0;
    let dlat = 0;
    for (const ei of [prevEdge, currEdge]) {
      if (edgeOffset[ei] > 0) {
        const [nx, ny] = normals[ei];
        dlng += nx * (edgeOffset[ei] + buffer);
        dlat += ny * (edgeOffset[ei] + buffer);
      }
    }
    return { lat: vertex.lat + dlat, lng: vertex.lng + dlng };
  });
}
function simplifyPolygon(points, maxPoints = 15) {
  let openPoints = points;
  if (points.length > 1 && points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng) {
    openPoints = points.slice(0, -1);
  }
  if (openPoints.length <= maxPoints) return openPoints;
  let hull = convexHull(openPoints);
  if (hull.length > maxPoints) {
    hull = visvalingam(hull, maxPoints);
  }
  function allContained(polygon, originals) {
    const vertexSet = new Set(polygon.map((v) => `${v.lat},${v.lng}`));
    for (const p of originals) {
      if (vertexSet.has(`${p.lat},${p.lng}`)) continue;
      if (!pointInPolygon(p, polygon)) return false;
    }
    return true;
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    if (allContained(hull, openPoints)) break;
    hull = enforceContainment(hull, openPoints);
  }
  return hull;
}

// src/parsers/street.ts
var DIRECTIONALS = /* @__PURE__ */ new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
var STREET_TYPES = /* @__PURE__ */ new Set([
  "Ave",
  "Blvd",
  "Cir",
  "Ct",
  "Dr",
  "Expy",
  "Fwy",
  "Hwy",
  "Ln",
  "Loop",
  "Pass",
  "Path",
  "Pkwy",
  "Pl",
  "Rd",
  "Run",
  "Sq",
  "St",
  "Ter",
  "Trl",
  "Walk",
  "Way"
]);
var STREET_TYPE_LOOKUP = /* @__PURE__ */ new Map();
for (const t of STREET_TYPES) STREET_TYPE_LOOKUP.set(t.toLowerCase(), t);
var FULL_FORMS = {
  avenue: "Ave",
  boulevard: "Blvd",
  circle: "Cir",
  court: "Ct",
  drive: "Dr",
  expressway: "Expy",
  freeway: "Fwy",
  highway: "Hwy",
  lane: "Ln",
  loop: "Loop",
  parkway: "Pkwy",
  place: "Pl",
  road: "Rd",
  square: "Sq",
  street: "St",
  terrace: "Ter",
  trail: "Trl",
  way: "Way"
};
for (const [full, abbrev] of Object.entries(FULL_FORMS)) {
  STREET_TYPE_LOOKUP.set(full, abbrev);
}
var DIRECTIONAL_LOOKUP = /* @__PURE__ */ new Map();
for (const d of DIRECTIONALS) DIRECTIONAL_LOOKUP.set(d.toLowerCase(), d);
function parseStreet(streetString) {
  let tokens = streetString.trim().split(/\s+/);
  if (tokens.length === 0 || tokens.length === 1 && tokens[0] === "") {
    return { name: streetString.trim(), type: "", prefix: "", suffix: "" };
  }
  let prefix = "";
  let suffix = "";
  let streetType = "";
  if (tokens.length > 1 && DIRECTIONAL_LOOKUP.has(tokens[0].toLowerCase())) {
    prefix = DIRECTIONAL_LOOKUP.get(tokens[0].toLowerCase());
    tokens = tokens.slice(1);
  }
  if (tokens.length > 0 && STREET_TYPE_LOOKUP.has(tokens[tokens.length - 1].toLowerCase())) {
    streetType = STREET_TYPE_LOOKUP.get(tokens[tokens.length - 1].toLowerCase());
    tokens = tokens.slice(0, -1);
    if (tokens.length > 0 && DIRECTIONAL_LOOKUP.has(tokens[tokens.length - 1].toLowerCase())) {
      suffix = DIRECTIONAL_LOOKUP.get(tokens[tokens.length - 1].toLowerCase());
      tokens = tokens.slice(0, -1);
    }
  } else if (tokens.length >= 2 && DIRECTIONAL_LOOKUP.has(tokens[tokens.length - 1].toLowerCase())) {
    if (STREET_TYPE_LOOKUP.has(tokens[tokens.length - 2].toLowerCase())) {
      suffix = DIRECTIONAL_LOOKUP.get(tokens[tokens.length - 1].toLowerCase());
      streetType = STREET_TYPE_LOOKUP.get(tokens[tokens.length - 2].toLowerCase());
      tokens = tokens.slice(0, -2);
    }
  }
  const name = tokens.length > 0 ? tokens.join(" ") : streetString.trim();
  return { name, type: streetType, prefix, suffix };
}
function streetsMatch(a, b) {
  const pa = parseStreet(a);
  const pb = parseStreet(b);
  if (pa.name.toLowerCase() !== pb.name.toLowerCase()) return false;
  if (pa.type && pb.type && pa.type !== pb.type) return false;
  if (pa.prefix && pb.prefix && pa.prefix !== pb.prefix) return false;
  if (pa.suffix && pb.suffix && pa.suffix !== pb.suffix) return false;
  return true;
}

// src/directions/format.ts
var METERS_TO_FEET2 = 3.28084;
var CARDINAL_KEYWORDS = /* @__PURE__ */ new Set([
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest"
]);
function hasCardinal(text) {
  const lower = text.toLowerCase();
  return [...CARDINAL_KEYWORDS].some((kw) => lower.includes(kw));
}
function replaceCardinal(text, replacement) {
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
function coordinatesEqual(a, b) {
  return a.lat === b.lat && a.lng === b.lng;
}
function roundCoordinate(value) {
  return Math.round(value * 1e6) / 1e6;
}
function formatCoordinate(c) {
  return `${roundCoordinate(c.lat)}, ${roundCoordinate(c.lng)}`;
}
var NAMES_A_ROAD = /\b(onto|on|toward|to stay on|via|exit|ramp|merge|destination|pass by|follow signs|u-turn)\b/i;
var BARE_TURN = /^(Turn|Slight|Sharp|Keep|Bear)\b/i;
var BARE_START = /^(Head|Continue)\b/i;
function nameUnnamedRoad(instruction) {
  if (NAMES_A_ROAD.test(instruction)) return instruction;
  if (BARE_TURN.test(instruction)) return `${instruction} onto an unnamed road`;
  if (BARE_START.test(instruction)) return `${instruction} on an unnamed road`;
  return instruction;
}
function normalizeLoopCoordinates(coordinates) {
  if (coordinates.length > 1 && coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])) {
    return coordinates.slice(0, -1);
  }
  return coordinates;
}
function buildDirectionsHeader(intersection, destination) {
  const { city, stateCode, zip, name } = intersection;
  const addressParts = [name];
  if (city) addressParts.push(city);
  if (stateCode && zip) addressParts.push(`${stateCode} ${zip}`);
  else if (stateCode) addressParts.push(stateCode);
  const directionsFrom = addressParts.join(", ");
  return `DIRECTIONS from ${directionsFrom} to ${formatCoordinate(destination)}`;
}
function renderRouteSteps(route, destination) {
  const lines = [];
  const steps = route.steps;
  const stepLocations = steps.map((step) => {
    const loc = step.startLocation?.latLng;
    return loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  });
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nav = step.navigationInstruction ?? {};
    const [maneuverLine, ...notes] = (nav.instructions ?? "Continue").split("\n");
    let instruction = nameUnnamedRoad(maneuverLine);
    const currentLocation = stepLocations[i];
    const nextStepLocation = i + 1 < stepLocations.length ? stepLocations[i + 1] : null;
    const hasUturn = instruction.toLowerCase().includes("u-turn");
    if (i === 0 && !hasUturn && hasCardinal(instruction) && currentLocation && nextStepLocation) {
      const { bearingDegrees } = geoMeasure(currentLocation, nextStepLocation);
      instruction = replaceCardinal(instruction, bearingToCardinal(bearingDegrees));
    } else if (!hasCardinal(instruction)) {
      const headingTarget = nextStepLocation ?? destination;
      if (currentLocation && headingTarget) {
        const { bearingDegrees } = geoMeasure(currentLocation, headingTarget);
        instruction = `${instruction} heading ${bearingToCardinal(bearingDegrees)}`;
      }
    }
    if (notes.length) instruction = [instruction, ...notes].join(" - ");
    const locVals = step.localizedValues ?? {};
    const dist = locVals.distance?.text ?? "";
    const dur = locVals.duration?.text ?? "";
    const suffix = [dist, dur].filter(Boolean).join(", ");
    lines.push(`${i + 1}. ${instruction} (${suffix})`);
  }
  return lines;
}
function formatStepDistance(meters) {
  const feet = meters * METERS_TO_FEET2;
  return feet >= 1e3 ? `${(feet / 5280).toFixed(1)} mi` : `${Math.round(feet)} ft`;
}
var ONSITE_STEP_TURN_DEGREES = 45;
function angularDifference(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}
function groupRouteSteps(path, turnThreshold) {
  const groups = [];
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
function renderAreaTrailer(coordinates) {
  const area = polygonAreaAcres(coordinates);
  const bbox = boundingBoxFeet(coordinates);
  return [
    "",
    `Area: ${area.toFixed(1)} acres`,
    `Bounding Box: ${Math.round(bbox.northSouthFeet)} feet (North-South) by ${Math.round(bbox.eastWestFeet)} feet (East-West)`,
    "",
    "Important Mark Utilities along and within the polygon boundary.",
    "Bounding box dimensions are for reference only - use polygon coordinates below."
  ];
}
function formatDirections(intersection, destination, route, coordinates, finalApproach) {
  const directionsLines = [buildDirectionsHeader(intersection, destination), ""];
  directionsLines.push(...renderRouteSteps(route, destination));
  if (finalApproach && finalApproach.distanceFeet > 0) {
    const road = finalApproach.roadName && !/^unnamed road$/i.test(finalApproach.roadName) ? finalApproach.roadName : null;
    const off = road ? ` off ${road}` : finalApproach.roadName ? " off an unnamed road" : " off the roadway";
    directionsLines.push(
      `${route.steps.length + 1}. Work area is about ${finalApproach.distanceFeet} ft ${finalApproach.cardinal}${off} - leave the road and enter the site (off-road).`
    );
  } else {
    directionsLines.push(`${route.steps.length + 1}. Arrive at the work area (${formatCoordinate(destination)}).`);
  }
  directionsLines.push(...renderAreaTrailer(coordinates));
  return directionsLines.join("\n");
}
function formatManualDirections({
  intersection,
  autoLeg,
  entrance,
  waypoints,
  polygon
}) {
  const lines = [buildDirectionsHeader(intersection, entrance), ""];
  lines.push(...renderRouteSteps(autoLeg, entrance));
  lines.push("");
  lines.push("Entrance/gate reached - proceed on-site to the work area:");
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
function formatMarkingText(coordinates) {
  const loopCoordinates = normalizeLoopCoordinates(coordinates);
  const n = loopCoordinates.length;
  const lines = [
    `WORK AREA BOUNDARIES (${n} points)`
  ];
  const start = loopCoordinates[0];
  lines.push(`Start: ${formatCoordinate(start)}`);
  for (let j = 1; j <= n; j++) {
    const prev = loopCoordinates[j - 1];
    const curr = loopCoordinates[j % n];
    const { distanceMeters, bearingDegrees } = geoMeasure(prev, curr);
    const cardinal = bearingToCardinal(bearingDegrees).toUpperCase();
    const distanceFeet = Math.round(distanceMeters * METERS_TO_FEET2);
    lines.push(`    -> ${cardinal} ${distanceFeet} ft to ${formatCoordinate(curr)}`);
  }
  lines.push(`Returns to start point (${formatCoordinate(start)})`);
  return lines.join("\n");
}

// src/parsers/normalize.ts
var REPLACEMENTS = [
  [/\bCo\.?\s+Rd\b/gi, "County Road"],
  [/\bCnty\.?\s+Rd\b/gi, "County Road"],
  [/\bUS\s+Hwy\b/gi, "US Highway"],
  [/\b(?:State|St)\s+Hwy\b/gi, "State Highway"],
  [/\bRanch\s+Rd\b/gi, "Ranch Road"],
  // "Road" is required; see docs/decisions.md, "Texas road-name spellings".
  [/\bFM\b(?:\s+(?:Rd|Road)\b)?/gi, "Farm to Market Road"],
  [/\bRM\b(?:\s+(?:Rd|Road)\b)?/gi, "Ranch to Market Road"],
  [/\bCR\b[\s-]*(?=\d)/gi, "County Road "],
  [/\bHwy\b/gi, "Highway"],
  // Standalone directionals (compounds first).
  [/\bNE\b/g, "Northeast"],
  [/\bNW\b/g, "Northwest"],
  [/\bSE\b/g, "Southeast"],
  [/\bSW\b/g, "Southwest"],
  [/\bN\b/g, "North"],
  [/\bS\b/g, "South"],
  [/\bE\b/g, "East"],
  [/\bW\b/g, "West"]
];
function normalizeRoadName(name) {
  let out = (name || "").trim().replace(/\s+/g, " ");
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
}

// src/api/google.ts
var NEAREST_ROADS_URL = "https://roads.googleapis.com/v1/nearestRoads";
var GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
var ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
function parseAddressComponents(result) {
  const components = result.address_components ?? [];
  const info = {};
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
  const geo = result.geometry?.location;
  if (geo) {
    info.lat = geo.lat;
    info.lng = geo.lng;
  }
  return info;
}
async function geocodeRequest(apiKey, params) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return [];
    const data = await resp.json();
    if (data.status === "OK") return data.results ?? [];
    return [];
  } catch {
    return [];
  }
}
async function findNearestRoadPoint(apiKey, coordinates) {
  const points = coordinates.map((c) => `${c.lat},${c.lng}`).join("|");
  const url = new URL(NEAREST_ROADS_URL);
  url.searchParams.set("points", points);
  url.searchParams.set("key", apiKey);
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.snappedPoints || data.snappedPoints.length === 0) return null;
    return data.snappedPoints.map((sp) => ({
      location: { lat: sp.location.latitude, lng: sp.location.longitude },
      originalIndex: sp.originalIndex
    }));
  } catch {
    return null;
  }
}
async function reverseGeocode(apiKey, lat, lng) {
  const results = await geocodeRequest(apiKey, { latlng: `${lat},${lng}` });
  for (const result of results) {
    const types = result.types ?? [];
    if (types.includes("route") || types.includes("street_address")) {
      const info = parseAddressComponents(result);
      if (info.street && info.lat !== void 0 && info.lng !== void 0) {
        return {
          street: info.street,
          city: info.city,
          county: info.county,
          state: info.state,
          stateCode: info.stateCode,
          zip: info.zip,
          lat: info.lat,
          lng: info.lng
        };
      }
    }
  }
  return null;
}
async function googleValidates(apiKey, street1, street2, context) {
  const parts = [context?.city, context?.stateCode].filter(Boolean);
  const suffix = parts.length ? `, ${parts.join(", ")}` : "";
  const addresses = [
    `${normalizeRoadName(street1)} and ${normalizeRoadName(street2)}${suffix}`,
    `${collapseSpaces(street1)} and ${collapseSpaces(street2)}${suffix}`
  ];
  for (const address of [...new Set(addresses)]) {
    const results = await geocodeRequest(apiKey, { address });
    for (const result of results) {
      const types = result.types ?? [];
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
var MAX_INTERSECTION_DISTANCE_METERS = 8e3;
var METERS_PER_DEGREE_LAT = 111320;
function parseIntersectionStreets(result) {
  const head = String(result.formatted_address ?? "").split(",")[0].trim();
  const streets = head.split(/\s*&\s*/);
  if (streets.length !== 2 || !streets[0] || !streets[1]) return null;
  return { name: `${streets[0]} & ${streets[1]}`, street1: streets[0], street2: streets[1] };
}
function distanceToArea(point, area) {
  let best = Infinity;
  for (const vertex of area) {
    best = Math.min(best, geoMeasure(point, vertex).distanceMeters);
  }
  return best;
}
function collapseSpaces(text) {
  return text.trim().replace(/\s+/g, " ");
}
function buildIntersectionQueries(text, context = {}) {
  const [streetPart, ...localityParts] = text.trim().replace(/\s+and\s+/i, " & ").split(",");
  const streets = streetPart.split(/\s*&\s*/);
  const typedLocality = localityParts.map((part) => part.trim()).filter(Boolean);
  const locality = typedLocality.length ? typedLocality : [context.city, context.stateCode].filter((part) => Boolean(part));
  const shared = {
    components: context.stateCode ? `country:US|administrative_area:${context.stateCode}` : "country:US"
  };
  const area = context.area ?? [];
  if (area.length > 0) {
    const lats = area.map((c) => c.lat);
    const lngs = area.map((c) => c.lng);
    const padLat = MAX_INTERSECTION_DISTANCE_METERS / METERS_PER_DEGREE_LAT;
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const padLng = padLat / Math.max(Math.cos(midLat * Math.PI / 180), 0.1);
    shared.bounds = `${Math.min(...lats) - padLat},${Math.min(...lngs) - padLng}|${Math.max(...lats) + padLat},${Math.max(...lngs) + padLng}`;
  }
  const dropRouteDirectional = (street) => street.replace(/(\d+)\s+(N|S|E|W|North|South|East|West)\.?$/i, "$1");
  const expandCountyRoad = (street) => street.replace(/\b(?:CR|Co\.?\s+Rd|Cnty\.?\s+Rd)\b[\s-]*(?=\d)/gi, "County Road ");
  const addresses = [
    [streets.map(collapseSpaces).join(" & "), ...locality].join(", "),
    [streets.map((street) => normalizeRoadName(street)).join(" & "), ...locality].join(", "),
    [streets.map((street) => expandCountyRoad(dropRouteDirectional(collapseSpaces(street)))).join(" & "), ...locality].join(", ")
  ];
  return [...new Set(addresses)].map((address) => ({ address, ...shared }));
}
function selectNearbyIntersection(results, area = []) {
  for (const result of results) {
    const types = result.types ?? [];
    if (!types.includes("intersection")) continue;
    if (area.length === 0) return result;
    const { lat, lng } = parseAddressComponents(result);
    if (lat === void 0 || lng === void 0) continue;
    if (distanceToArea({ lat, lng }, area) <= MAX_INTERSECTION_DISTANCE_METERS) return result;
  }
  return null;
}
async function geocodeIntersection(apiKey, addressString, context) {
  let match = null;
  for (const params of buildIntersectionQueries(addressString, context)) {
    match = selectNearbyIntersection(await geocodeRequest(apiKey, params), context?.area);
    if (match) break;
  }
  if (!match) return null;
  const info = parseAddressComponents(match);
  if (info.lat === void 0 || info.lng === void 0) return null;
  const typed = addressString.replace(/\s+and\s+/i, " & ").split(",")[0].split(/\s*&\s*/);
  const streets = parseIntersectionStreets(match) ?? {
    name: typed.map((s) => s.trim()).filter(Boolean).join(" & "),
    street1: (typed[0] ?? "").trim(),
    street2: (typed[1] ?? "").trim()
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
    verified: true
  };
}
function routeHasUturn(route) {
  const steps = route.legs[0]?.steps ?? [];
  return steps.some((step) => {
    const instr = step.navigationInstruction;
    return (instr?.instructions ?? "").toLowerCase().includes("u-turn");
  });
}
async function computeRoute(apiKey, origin, destination, heading) {
  const location = {
    latLng: { latitude: origin.lat, longitude: origin.lng }
  };
  if (heading !== void 0) {
    location.heading = Math.round(heading);
  }
  const body = {
    origin: { location },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } }
    },
    travelMode: "DRIVE",
    computeAlternativeRoutes: true,
    // A locator's last mile is surface streets; both are preferences, so a site
    // reachable only by highway still gets a route.
    routeModifiers: { avoidTolls: true, avoidHighways: true }
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
          "routes.legs.endLocation",
          "routes.distanceMeters"
        ].join(",")
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.routes || data.routes.length === 0) return null;
    const routes = data.routes;
    const noUturn = routes.filter((r) => !routeHasUturn(r));
    const chosen = noUturn.length > 0 ? noUturn[0] : routes[0];
    const leg = chosen.legs[0];
    const end = leg.endLocation?.latLng;
    return {
      steps: leg.steps,
      // A missing distance is a zero-length route; see docs/decisions.md, "Request cost".
      distanceMeters: chosen.distanceMeters ?? 0,
      localizedValues: leg.localizedValues,
      ...end ? { endLocation: { lat: end.latitude, lng: end.longitude } } : {}
    };
  } catch {
    return null;
  }
}

// src/api/geonames.ts
var GEONAMES_INTERSECTION_URL = "https://secure.geonames.org/findNearestIntersectionJSON";
var MAX_VALIDATION_DISTANCE_METERS = 750;
function buildResult(ix, googleInfo) {
  const name = `${ix.street1} & ${ix.street2}`;
  const ixLat = parseFloat(ix.lat);
  const ixLng = parseFloat(ix.lng);
  if (googleInfo && googleInfo.lat !== void 0 && googleInfo.lng !== void 0 && geoMeasure({ lat: ixLat, lng: ixLng }, { lat: googleInfo.lat, lng: googleInfo.lng }).distanceMeters > MAX_VALIDATION_DISTANCE_METERS) {
    googleInfo = null;
  }
  if (googleInfo) {
    const hasGoogleIdentity = Boolean(
      googleInfo.intersectionName && googleInfo.intersectionStreet1 && googleInfo.intersectionStreet2 && googleInfo.lat !== void 0 && googleInfo.lng !== void 0
    );
    return {
      name: hasGoogleIdentity ? googleInfo.intersectionName : name,
      street1: hasGoogleIdentity ? googleInfo.intersectionStreet1 : ix.street1,
      street2: hasGoogleIdentity ? googleInfo.intersectionStreet2 : ix.street2,
      lat: hasGoogleIdentity ? googleInfo.lat : ixLat,
      lng: hasGoogleIdentity ? googleInfo.lng : ixLng,
      county: googleInfo.county ?? ix.adminName2,
      city: googleInfo.city ?? ix.placeName,
      state: googleInfo.state ?? ix.adminName1,
      stateCode: googleInfo.stateCode ?? ix.adminCode1,
      zip: googleInfo.zip ?? ix.postalcode,
      verified: true
    };
  }
  return {
    name,
    street1: ix.street1,
    street2: ix.street2,
    lat: ixLat,
    lng: ixLng,
    county: ix.adminName2,
    city: ix.placeName,
    state: ix.adminName1,
    stateCode: ix.adminCode1,
    zip: ix.postalcode,
    verified: false
  };
}
function sortByPreferredRoad(items, getStreets, preferredRoad) {
  if (!preferredRoad) return items;
  const matching = items.filter((item) => {
    const { street1, street2 } = getStreets(item);
    return streetsMatch(street1, preferredRoad) || streetsMatch(street2, preferredRoad);
  });
  const nonMatching = items.filter((item) => {
    const { street1, street2 } = getStreets(item);
    return !streetsMatch(street1, preferredRoad) && !streetsMatch(street2, preferredRoad);
  });
  return [...matching, ...nonMatching];
}
async function fetchIntersectionNodes(geonamesUsername, point, options) {
  const url = new URL(GEONAMES_INTERSECTION_URL);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lng", String(point.lng));
  url.searchParams.set("maxRows", String(options.maxRows));
  url.searchParams.set("radius", String(options.radiusKm));
  url.searchParams.set("username", geonamesUsername);
  let data;
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return [];
    data = await resp.json();
  } catch {
    return [];
  }
  const raw = data.intersection;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}
async function validateIntersectionNodes(googleApiKey, nodes) {
  return Promise.all(
    nodes.map(
      async (ix) => buildResult(
        ix,
        await googleValidates(googleApiKey, ix.street1, ix.street2, {
          city: ix.placeName,
          stateCode: ix.adminCode1
        })
      )
    )
  );
}
async function findIntersectionCandidates(googleApiKey, geonamesUsername, lat, lng, options) {
  const { preferredRoad, maxCandidates = 3, radiusKm = 1 } = options ?? {};
  const nodes = await fetchIntersectionNodes(geonamesUsername, { lat, lng }, { maxRows: maxCandidates, radiusKm });
  const results = await validateIntersectionNodes(googleApiKey, nodes);
  return sortByPreferredRoad(results, (ix) => ix, preferredRoad);
}
async function findNearestIntersection(googleApiKey, geonamesUsername, lat, lng, options) {
  const candidates = await findIntersectionCandidates(
    googleApiKey,
    geonamesUsername,
    lat,
    lng,
    options
  );
  return candidates[0] ?? null;
}

// src/selection.ts
var ROUTE_PENALTY_METERS = {
  rampOrMerge: 500,
  toll: 1e3,
  uturn: 300,
  limitedAccessStart: 1500
};
var LIMITED_ACCESS = /\b(I-?\s?\d+|IH-?\s?\d+|Interstate|Tollway|Turnpike|Tpke|Expressway|Expy|Freeway|Fwy|Memorial Highway)\b/i;
var LOCAL_ACCESS = /\b(Frontage|Service|Svc|Access|Frntg)\b/i;
function isLimitedAccessRoad(name) {
  return LIMITED_ACCESS.test(name) && !LOCAL_ACCESS.test(name);
}
function routePenaltyMeters(route, candidate) {
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
var OFFROAD_WEIGHT = 2;
function offRoadMeters(route, destination) {
  return route.endLocation ? geoMeasure(route.endLocation, destination).distanceMeters : 0;
}
function selectionScore(route, candidate, destination) {
  return route.distanceMeters + routePenaltyMeters(route, candidate) + OFFROAD_WEIGHT * offRoadMeters(route, destination);
}
function ringPoints(center, radiusKm, count) {
  const latKm = 111.32;
  const lngKm = latKm * Math.cos(center.lat * Math.PI / 180);
  return Array.from({ length: count }, (_, i) => {
    const bearing = 2 * Math.PI * i / count;
    return {
      lat: center.lat + radiusKm / latKm * Math.cos(bearing),
      lng: center.lng + radiusKm / lngKm * Math.sin(bearing)
    };
  });
}
function eligibleRoadNames(names) {
  const seen = /* @__PURE__ */ new Set();
  const roads = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || key === "unnamed road" || seen.has(key) || isLimitedAccessRoad(name)) continue;
    seen.add(key);
    roads.push(name);
  }
  return roads;
}
function roadNamePairs(names, max) {
  const roads = eligibleRoadNames(names);
  const pairs = [];
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) pairs.push({ pair: [roads[i], roads[j]], rank: i + j, i });
  }
  return pairs.sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, max).map((p) => p.pair);
}
function pairNamesNeeded(max) {
  const names = Array.from({ length: max + 2 }, (_, i) => `Road ${i}`);
  return Math.max(...roadNamePairs(names, max).flat().map((n) => names.indexOf(n))) + 1;
}
var ROUTE_BOUND_SLACK_METERS = 50;
function stepRoad(instruction) {
  const line = instruction.split("\n")[0];
  const m = /\b(?:onto|on)\s+(.+?)(?:\s+toward\b.*|\s+heading\b.*)?$/i.exec(line);
  if (!m) return null;
  const road = m[1].split("/")[0].trim();
  return road && !/^(the|a|an)\b/i.test(road) ? road : null;
}
function stepTowardRoad(instruction) {
  const m = /\btoward\s+(.+?)(?:\s+heading\b.*)?$/i.exec(instruction.split("\n")[0]);
  if (!m) return null;
  const road = m[1].split("/")[0].trim();
  return road && !/^(the|a|an)\b/i.test(road) ? road : null;
}
function routeJunctions(route) {
  const junctions = [];
  let previous = null;
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
function pointBeyond(center, vertex, meters) {
  const latKm = 111.32;
  const lngKm = latKm * Math.cos(center.lat * Math.PI / 180);
  const dy = (vertex.lat - center.lat) * latKm;
  const dx = (vertex.lng - center.lng) * lngKm;
  const len = Math.hypot(dx, dy) || 1;
  const km = meters / 1e3;
  return { lat: vertex.lat + dy / len * (km / latKm), lng: vertex.lng + dx / len * (km / lngKm) };
}

// src/client.ts
function coordinatesEqual2(a, b) {
  return a.lat === b.lat && a.lng === b.lng;
}
function rotateCoordinatesToStart(coordinates, start) {
  if (coordinates.length === 0) return [];
  const isClosed = coordinates.length > 1 && coordinatesEqual2(coordinates[0], coordinates[coordinates.length - 1]);
  const openCoordinates = isClosed ? coordinates.slice(0, -1) : coordinates.slice();
  const startIndex = openCoordinates.findIndex((coord) => coordinatesEqual2(coord, start));
  if (startIndex <= 0) {
    return isClosed ? [...openCoordinates, openCoordinates[0]] : openCoordinates;
  }
  const rotated = [
    ...openCoordinates.slice(startIndex),
    ...openCoordinates.slice(0, startIndex)
  ];
  return isClosed ? [...rotated, rotated[0]] : rotated;
}
function extractTurnStreets(steps) {
  for (let i = steps.length - 1; i >= 0; i--) {
    const maneuver = steps[i].navigationInstruction?.maneuver ?? "";
    if (maneuver === "TURN_LEFT" || maneuver === "TURN_RIGHT") {
      const instruction = steps[i].navigationInstruction?.instructions ?? "";
      const ontoMatch = instruction.match(/onto (.+?)(?:\s*\(|$)/);
      const fromMatch = instruction.match(/on (.+?)(?:\s+toward|\s*\(|$)/);
      return {
        from: fromMatch ? fromMatch[1].trim() : null,
        onto: ontoMatch ? ontoMatch[1].trim() : null
      };
    }
  }
  return { from: null, onto: null };
}
function nearestCoordinateToTarget(coordinates, target) {
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
function polygonCentroid(coordinates) {
  const count = coordinates.length;
  let lat = 0;
  let lng = 0;
  for (const coordinate of coordinates) {
    lat += coordinate.lat;
    lng += coordinate.lng;
  }
  return { lat: lat / count, lng: lng / count };
}
var DEFAULT_MAX_CANDIDATES = 8;
var RING_RADII_KM = [1.5, 3];
var RING_POINTS = 8;
var MAX_ROAD_NAME_PAIRS = 28;
var ROAD_NAMES_NEEDED = pairNamesNeeded(MAX_ROAD_NAME_PAIRS);
var FIRST_ROUTE_WAVE = 2;
var MEMO_LIMIT = 5e3;
var ROAD_NAME_SEARCH_ABOVE_METERS = 300;
var ARRIVAL_RETRY_OFFROAD_METERS = 100;
var ARRIVAL_ALTERNATIVES = 4;
var JUNCTION_MATCH_METERS = 150;
var ROUTE_JUNCTIONS_TRIED = 3;
var JUNCTION_WALK_ROUNDS = 3;
var MAX_PROBE_VERTICES = 8;
var PROBE_CONCURRENCY = 10;
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
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
function dedupeCoordinates(coordinates) {
  const seen = /* @__PURE__ */ new Set();
  return coordinates.filter((c) => {
    const key = coordinateKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function betterSelection(a, b) {
  if (!a) return b;
  if (!b) return a;
  return b.score < a.score ? b : a;
}
function coordinateKey(coordinate) {
  return `${coordinate.lat},${coordinate.lng}`;
}
function boundingBoxExtremeOrigins(coordinates, snappedPoints, primary) {
  if (coordinates.length === 0) return [];
  const snapByIndex = /* @__PURE__ */ new Map();
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
  const seen = /* @__PURE__ */ new Set([coordinateKey(primary)]);
  const origins = [];
  for (const idx of [minLat, maxLat, minLng, maxLng]) {
    const origin = snapByIndex.get(idx) ?? coordinates[idx];
    const key = coordinateKey(origin);
    if (seen.has(key)) continue;
    seen.add(key);
    origins.push(origin);
  }
  return origins;
}
var TicketGeoClient = class {
  googleApiKey;
  geonamesUsername;
  // The selection asks the same question from several paths (a junction that is
  // also a pair, a vertex retried); each billable answer is fetched once.
  memo = /* @__PURE__ */ new Map();
  constructor(config) {
    this.googleApiKey = config.googleMapsApiKey;
    this.geonamesUsername = config.geonamesUsername;
  }
  remember(key, load) {
    let hit = this.memo.get(key);
    if (!hit) {
      if (this.memo.size >= MEMO_LIMIT) this.memo.clear();
      hit = load();
      this.memo.set(key, hit);
    }
    return hit;
  }
  async findNearestRoadPoint(coordinates) {
    const result = await findNearestRoadPoint(this.googleApiKey, coordinates);
    if (!result) throw new Error("Roads API returned no snapped points");
    return result;
  }
  async reverseGeocode(lat, lng) {
    return this.remember(`rev|${lat},${lng}`, () => reverseGeocode(this.googleApiKey, lat, lng));
  }
  async geocodeIntersection(address, context) {
    return this.remember(
      `ix|${address}|${JSON.stringify(context ?? {})}`,
      () => geocodeIntersection(this.googleApiKey, address, context)
    );
  }
  async findNearestIntersection(lat, lng, options) {
    return findNearestIntersection(
      this.googleApiKey,
      this.geonamesUsername,
      lat,
      lng,
      options
    );
  }
  async computeRoute(origin, destination, heading) {
    return this.remember(
      `route|${origin.lat},${origin.lng}|${destination.lat},${destination.lng}|${heading}`,
      () => computeRoute(this.googleApiKey, origin, destination, heading)
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
  async selectShortestRouteIntersection(coordinates, options) {
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
    const preferredRoad = options?.preferredRoad ?? (await this.reverseGeocode(snappedPoint.lat, snappedPoint.lng))?.street;
    const candidates = await findIntersectionCandidates(
      this.googleApiKey,
      this.geonamesUsername,
      snappedPoint.lat,
      snappedPoint.lng,
      {
        preferredRoad,
        maxCandidates: options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
        radiusKm: options?.radiusKm
      }
    );
    return this.routeCandidates(coordinates, candidates);
  }
  /**
   * Routes every candidate to its nearest work-area vertex (in parallel) and
   * keeps the lowest score: drive length plus routePenaltyMeters. Within 10 m of
   * each other, the linearly nearer candidate wins.
   */
  async routeCandidates(coordinates, candidates) {
    const entries = candidates.map((candidate, order) => ({ candidate, order, nearest: nearestCoordinateToTarget(coordinates, candidate) })).filter((e) => e.nearest !== null).sort((a, b) => a.nearest.distanceMeters - b.nearest.distanceMeters);
    const routeOne = async ({ candidate, order, nearest }) => {
      const { bearingDegrees: heading } = geoMeasure(candidate, nearest.coordinate);
      const route = await this.computeRoute(candidate, nearest.coordinate, heading);
      if (!route) return null;
      return {
        result: { intersection: candidate, nearestCoordinate: nearest.coordinate, route, score: selectionScore(route, candidate, nearest.coordinate) },
        linear: nearest.distanceMeters,
        order
      };
    };
    const firstWave = (await Promise.all(entries.slice(0, FIRST_ROUTE_WAVE).map(routeOne))).filter((r) => r !== null);
    const bounded = firstWave.length > 0 && firstWave.every((r) => r.result.route.endLocation);
    const bestSoFar = Math.min(...firstWave.map((r) => r.result.score));
    const rest = entries.slice(FIRST_ROUTE_WAVE).filter((e) => !bounded || e.nearest.distanceMeters <= bestSoFar + ROUTE_BOUND_SLACK_METERS);
    const routed = [...firstWave, ...await Promise.all(rest.map(routeOne))].filter((r) => r !== null).sort((a, b) => a.order - b.order);
    let best = null;
    for (const entry of routed) {
      if (!entry) continue;
      const better = !best || entry.result.score < best.result.score - 10;
      const tiedButNearer = !!best && Math.abs(entry.result.score - best.result.score) <= 10 && entry.linear < best.linear;
      if (better || tiedButNearer) best = entry;
    }
    return best ? this.refineArrival(coordinates, best.result) : null;
  }
  /**
   * The vertex nearest the intersection can sit beside a freeway or deep in a
   * field. When the drive there is penalized or ends far off-road, route to the
   * next-nearest vertices too and keep the lowest score.
   */
  async refineArrival(coordinates, selected) {
    const { intersection, route, nearestCoordinate } = selected;
    const needsRetry = routePenaltyMeters(route, intersection) > 0 || offRoadMeters(route, nearestCoordinate) > ARRIVAL_RETRY_OFFROAD_METERS;
    if (!needsRetry) return selected;
    const seen = /* @__PURE__ */ new Set([coordinateKey(nearestCoordinate)]);
    const alternatives = [...coordinates].sort((a, b) => geoMeasure(intersection, a).distanceMeters - geoMeasure(intersection, b).distanceMeters).filter((c) => {
      const key = coordinateKey(c);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, ARRIVAL_ALTERNATIVES).filter(
      (v) => !route.endLocation || geoMeasure(intersection, v).distanceMeters <= selected.score + ROUTE_BOUND_SLACK_METERS
    );
    const tried = await Promise.all(
      alternatives.map(async (vertex) => {
        const r = await this.computeRoute(intersection, vertex, geoMeasure(intersection, vertex).bearingDegrees);
        return r ? { intersection, nearestCoordinate: vertex, route: r, score: selectionScore(r, intersection, vertex) } : null;
      })
    );
    return tried.reduce((best, t) => t && t.score < best.score ? t : best, selected);
  }
  /**
   * The nearest snapped vertex on a local road other than `primaryStreet`. A
   * freeway snap finds only interchanges; this gives the search a second origin.
   */
  async localRoadOrigin(coordinates, snappedPoints, primaryStreet) {
    const bySnapDistance = [...snappedPoints].sort(
      (a, b) => geoMeasure(coordinates[a.originalIndex], a.location).distanceMeters - geoMeasure(coordinates[b.originalIndex], b.location).distanceMeters
    );
    const tried = /* @__PURE__ */ new Set();
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
  async walkRouteJunctions(coordinates, selected, locality) {
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
  async routeJunctionCandidates(coordinates, selected, locality) {
    const junctions = routeJunctions(selected.route).slice(0, ROUTE_JUNCTIONS_TRIED);
    const found = await Promise.all(
      junctions.map(async ({ roads, at }) => {
        const ix = await this.geocodeIntersection(`${roads[0]} & ${roads[1]}`, {
          area: coordinates,
          city: locality.city,
          stateCode: locality.stateCode
        });
        if (!ix) return null;
        return !at || geoMeasure(ix, at).distanceMeters <= JUNCTION_MATCH_METERS ? ix : null;
      })
    );
    return found.filter((ix) => ix !== null);
  }
  /** GeoNames nodes on rings past its 1 km search cap, the nearest few validated. */
  async ringCandidates(coordinates) {
    const center = polygonCentroid(coordinates);
    for (const radiusKm of RING_RADII_KM) {
      const nodes = /* @__PURE__ */ new Map();
      for (const point of ringPoints(center, radiusKm, RING_POINTS)) {
        for (const node of await fetchIntersectionNodes(this.geonamesUsername, point, { maxRows: 3, radiusKm: 1 })) {
          nodes.set(`${node.street1}|${node.street2}`.toLowerCase(), node);
        }
      }
      if (nodes.size === 0) continue;
      const nearest = [...nodes.values()].map((node) => ({ node, d: distanceToArea({ lat: parseFloat(node.lat), lng: parseFloat(node.lng) }, coordinates) })).sort((a, b) => a.d - b.d).slice(0, DEFAULT_MAX_CANDIDATES).map((x) => x.node);
      return validateIntersectionNodes(this.googleApiKey, nearest);
    }
    return [];
  }
  /**
   * Last resort where GeoNames has no data: collect the road names Google knows
   * around the site and geocode each pair as an intersection.
   */
  async roadNamePairCandidates(coordinates, snappedPoints, locality) {
    const center = polygonCentroid(coordinates);
    const vertices = dedupeCoordinates(coordinates).slice(0, MAX_PROBE_VERTICES);
    const probes = [
      ...dedupeCoordinates(snappedPoints.map((sp) => sp.location)).slice(0, MAX_PROBE_VERTICES),
      ...vertices,
      ...vertices.map((v) => pointBeyond(center, v, 75)),
      ...vertices.map((v) => pointBeyond(center, v, 250)),
      ...ringPoints(center, 0.75, RING_POINTS)
    ];
    const roads = [];
    for (let i = 0; i < probes.length; i += PROBE_CONCURRENCY) {
      const batch = probes.slice(i, i + PROBE_CONCURRENCY);
      roads.push(...await Promise.all(batch.map((p) => this.reverseGeocode(p.lat, p.lng))));
      if (eligibleRoadNames(roads.map((r) => r?.street ?? "")).length >= ROAD_NAMES_NEEDED) break;
    }
    const names = roads.map((r) => r?.street ?? "").filter(Boolean);
    const pairs = roadNamePairs(names, MAX_ROAD_NAME_PAIRS);
    const found = await mapLimit(
      pairs,
      PROBE_CONCURRENCY,
      ([a, b]) => this.geocodeIntersection(`${a} & ${b}`, { area: coordinates, city: locality.city, stateCode: locality.stateCode })
    );
    const unique = /* @__PURE__ */ new Map();
    for (const ix of found) if (ix) unique.set(`${ix.lat.toFixed(5)},${ix.lng.toFixed(5)}`, ix);
    return [...unique.values()];
  }
  async processSite(coordinates, options) {
    const intersectionOverride = options?.intersectionOverride;
    let snappedPoints;
    try {
      snappedPoints = await this.findNearestRoadPoint(coordinates);
    } catch (err) {
      console.warn(
        `findNearestRoadPoint failed; falling back to reverse-geocode: ${err instanceof Error ? err.message : String(err)}`
      );
      snappedPoints = [];
    }
    let bestDist = Infinity;
    let bestOriginal = null;
    let bestSnapped = null;
    for (const sp of snappedPoints) {
      const orig = coordinates[sp.originalIndex];
      const { distanceMeters } = geoMeasure(orig, sp.location);
      if (distanceMeters < bestDist) {
        bestDist = distanceMeters;
        bestOriginal = orig;
        bestSnapped = sp.location;
      }
    }
    let snapRoadInfo = null;
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
    if (!snapRoadInfo) {
      snapRoadInfo = await this.reverseGeocode(bestSnapped.lat, bestSnapped.lng);
    }
    let snapStreet = snapRoadInfo?.street ?? null;
    let intersection = null;
    let startCoordinate = null;
    let routeResult = null;
    if (intersectionOverride) {
      intersection = await this.geocodeIntersection(intersectionOverride, {
        area: coordinates,
        city: snapRoadInfo?.city,
        stateCode: snapRoadInfo?.stateCode
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
        score: selectionScore(routeResult, intersection, startCoordinate)
      });
      startCoordinate = refined.nearestCoordinate;
      routeResult = refined.route;
    } else {
      let selected = await this.selectShortestRouteIntersection(coordinates, {
        snappedPoint: bestSnapped,
        preferredRoad: snapStreet ?? void 0
      });
      if (!selected || routePenaltyMeters(selected.route, selected.intersection) > 0) {
        const local = await this.localRoadOrigin(coordinates, snappedPoints, snapStreet);
        if (local) {
          selected = betterSelection(
            selected,
            await this.selectShortestRouteIntersection(coordinates, {
              snappedPoint: local.location,
              preferredRoad: local.street
            })
          );
        }
      }
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
    const orderedCoordinates = rotateCoordinatesToStart(coordinates, startCoordinate);
    startCoordinate = orderedCoordinates[0];
    if (!snapStreet) {
      const { onto } = extractTurnStreets(routeResult.steps);
      if (onto) snapStreet = onto;
    }
    if (snapRoadInfo) {
      intersection = {
        ...intersection,
        county: intersection.county || snapRoadInfo.county || "",
        city: intersection.city || snapRoadInfo.city || "",
        state: intersection.state || snapRoadInfo.state || "",
        stateCode: intersection.stateCode || snapRoadInfo.stateCode || "",
        zip: intersection.zip || snapRoadInfo.zip || ""
      };
    }
    let finalApproach;
    const driveEnd = routeResult.endLocation;
    const arrivalRoad = driveEnd ? await this.reverseGeocode(driveEnd.lat, driveEnd.lng) : await this.reverseGeocode(startCoordinate.lat, startCoordinate.lng);
    const roadPoint = driveEnd ?? (arrivalRoad ? { lat: arrivalRoad.lat, lng: arrivalRoad.lng } : null);
    if (roadPoint) {
      const { distanceMeters, bearingDegrees } = geoMeasure(roadPoint, startCoordinate);
      if (distanceMeters > 30) {
        finalApproach = {
          distanceFeet: Math.round(distanceMeters * 3.28084),
          cardinal: bearingToCardinal(bearingDegrees),
          roadName: arrivalRoad?.street
        };
      }
    }
    const directionsText = formatDirections(intersection, startCoordinate, routeResult, orderedCoordinates, finalApproach);
    const markingText = formatMarkingText(orderedCoordinates);
    const areaAcres = polygonAreaAcres(orderedCoordinates);
    const boundingBox = boundingBoxFeet(orderedCoordinates);
    return {
      coordinates: orderedCoordinates,
      intersection,
      routeMeters: routeResult.distanceMeters,
      directionsText,
      markingText,
      areaAcres,
      boundingBox
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MAX_INTERSECTION_DISTANCE_METERS,
  TicketGeoClient,
  bearingToCardinal,
  boundingBoxFeet,
  formatDirections,
  formatManualDirections,
  formatMarkingText,
  geoMeasure,
  isLimitedAccessRoad,
  parseStreet,
  polygonAreaAcres,
  simplifyPolygon,
  streetsMatch,
  toPolygonWkt
});
//# sourceMappingURL=index.cjs.map