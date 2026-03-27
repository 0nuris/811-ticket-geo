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
function normalizeLoopCoordinates(coordinates) {
  if (coordinates.length > 1 && coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])) {
    return coordinates.slice(0, -1);
  }
  return coordinates;
}
function formatDirections(intersection, destination, route, coordinates) {
  const { city, stateCode, zip, name } = intersection;
  const addressParts = [name];
  if (city) addressParts.push(city);
  if (stateCode && zip) addressParts.push(`${stateCode} ${zip}`);
  else if (stateCode) addressParts.push(stateCode);
  const directionsFrom = addressParts.join(", ");
  const directionsLines = [
    `DIRECTIONS from ${directionsFrom} to ${destination.lat}, ${destination.lng}`,
    ""
  ];
  const steps = route.steps;
  const stepLocations = steps.map((step) => {
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
function formatMarkingText(coordinates) {
  const loopCoordinates = normalizeLoopCoordinates(coordinates);
  const n = loopCoordinates.length;
  const lines = [
    `WORK AREA BOUNDARIES (${n} points)`
  ];
  const start = loopCoordinates[0];
  lines.push(`Start: ${start.lat}, ${start.lng}`);
  for (let j = 1; j <= n; j++) {
    const prev = loopCoordinates[j - 1];
    const curr = loopCoordinates[j % n];
    const { distanceMeters, bearingDegrees } = geoMeasure(prev, curr);
    const cardinal = bearingToCardinal(bearingDegrees).toUpperCase();
    const distanceFeet = Math.round(distanceMeters * METERS_TO_FEET2);
    lines.push(`    -> ${cardinal} ${distanceFeet} ft to ${curr.lat}, ${curr.lng}`);
  }
  lines.push(`Returns to start point (${start.lat}, ${start.lng})`);
  return lines.join("\n");
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
async function googleValidates(apiKey, street1, street2) {
  const results = await geocodeRequest(apiKey, { address: `${street1} and ${street2}` });
  for (const result of results) {
    const types = result.types ?? [];
    if (types.includes("intersection")) {
      return parseAddressComponents(result);
    }
  }
  return null;
}
async function geocodeIntersection(apiKey, addressString) {
  const normalized = addressString.replace(/\s+and\s+/i, " & ");
  const results = await geocodeRequest(apiKey, { address: normalized });
  if (results.length === 0) return null;
  const info = parseAddressComponents(results[0]);
  if (info.lat === void 0 || info.lng === void 0) return null;
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
    zip: info.zip ?? ""
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
    computeAlternativeRoutes: true
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
    return {
      steps: leg.steps,
      distanceMeters: chosen.distanceMeters,
      localizedValues: leg.localizedValues
    };
  } catch {
    return null;
  }
}

// src/api/geonames.ts
var GEONAMES_INTERSECTION_URL = "https://secure.geonames.org/findNearestIntersectionJSON";
function buildResult(ix, googleInfo) {
  const name = `${ix.street1} & ${ix.street2}`;
  const ixLat = parseFloat(ix.lat);
  const ixLng = parseFloat(ix.lng);
  if (googleInfo) {
    return {
      name,
      street1: ix.street1,
      street2: ix.street2,
      lat: googleInfo.lat ?? ixLat,
      lng: googleInfo.lng ?? ixLng,
      county: googleInfo.county ?? ix.adminName2,
      city: googleInfo.city ?? ix.placeName,
      state: googleInfo.state ?? ix.adminName1,
      stateCode: googleInfo.stateCode ?? ix.adminCode1,
      zip: googleInfo.zip ?? ix.postalcode
    };
  }
  return {
    name: `${name} (unverified)`,
    street1: ix.street1,
    street2: ix.street2,
    lat: ixLat,
    lng: ixLng,
    county: ix.adminName2,
    city: ix.placeName,
    state: ix.adminName1,
    stateCode: ix.adminCode1,
    zip: ix.postalcode
  };
}
async function findNearestIntersection(googleApiKey, geonamesUsername, lat, lng, options) {
  const { preferredRoad, maxCandidates = 3, radiusKm = 1 } = options ?? {};
  const url = new URL(GEONAMES_INTERSECTION_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("maxRows", String(maxCandidates));
  url.searchParams.set("radius", String(radiusKm));
  url.searchParams.set("username", geonamesUsername);
  let data;
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    data = await resp.json();
  } catch {
    return null;
  }
  const raw = data.intersection;
  if (!raw) return null;
  const candidates = Array.isArray(raw) ? raw : [raw];
  const verified = [];
  for (const ix of candidates) {
    const googleInfo = await googleValidates(googleApiKey, ix.street1, ix.street2);
    if (googleInfo) {
      verified.push({ ix, googleInfo });
    }
  }
  if (preferredRoad && verified.length > 0) {
    for (const { ix, googleInfo } of verified) {
      if (ix.street1 === preferredRoad || ix.street2 === preferredRoad) {
        return buildResult(ix, googleInfo);
      }
    }
  }
  if (verified.length > 0) {
    return buildResult(verified[0].ix, verified[0].googleInfo);
  }
  return buildResult(candidates[0]);
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
var TicketGeoClient = class {
  googleApiKey;
  geonamesUsername;
  constructor(config) {
    this.googleApiKey = config.googleMapsApiKey;
    this.geonamesUsername = config.geonamesUsername;
  }
  async findNearestRoadPoint(coordinates) {
    const result = await findNearestRoadPoint(this.googleApiKey, coordinates);
    if (!result) throw new Error("Roads API returned no snapped points");
    return result;
  }
  async reverseGeocode(lat, lng) {
    return reverseGeocode(this.googleApiKey, lat, lng);
  }
  async geocodeIntersection(address) {
    return geocodeIntersection(this.googleApiKey, address);
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
    return computeRoute(this.googleApiKey, origin, destination, heading);
  }
  async processSite(coordinates, options) {
    const intersectionOverride = options?.intersectionOverride;
    const snappedPoints = await this.findNearestRoadPoint(coordinates);
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
    if (!bestOriginal || !bestSnapped) {
      throw new Error("Could not match any snapped point to original coordinates");
    }
    const snapRoadInfo = await this.reverseGeocode(bestSnapped.lat, bestSnapped.lng);
    let snapStreet = snapRoadInfo?.street ?? null;
    let intersection = null;
    if (intersectionOverride) {
      intersection = await this.geocodeIntersection(intersectionOverride);
    }
    if (!intersection) {
      const scoutIntersection = await this.findNearestIntersection(
        bestSnapped.lat,
        bestSnapped.lng,
        { preferredRoad: snapStreet ?? void 0 }
      );
      if (!scoutIntersection) throw new Error("No intersection found near snapped road point");
      const { bearingDegrees: scoutHeading } = geoMeasure(scoutIntersection, bestOriginal);
      const scoutResult = await this.computeRoute(scoutIntersection, bestOriginal, scoutHeading);
      if (!scoutResult) throw new Error("Could not compute scout route");
      const scoutDistance = scoutResult.distanceMeters;
      let lastTurn = null;
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
      if (lastTurn) {
        const turnIntersection = await this.findNearestIntersection(
          lastTurn.lat,
          lastTurn.lng,
          { preferredRoad: snapStreet ?? void 0 }
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
    const { bearingDegrees: heading } = geoMeasure(intersection, startCoordinate);
    const routeResult = await this.computeRoute(intersection, startCoordinate, heading);
    if (!routeResult) throw new Error("Could not compute route from intersection to site");
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
      boundingBox
    };
  }
};
export {
  TicketGeoClient,
  bearingToCardinal,
  boundingBoxFeet,
  formatDirections,
  formatMarkingText,
  geoMeasure,
  parseStreet,
  polygonAreaAcres,
  simplifyPolygon,
  toPolygonWkt
};
//# sourceMappingURL=index.js.map