import { describe, it, expect } from "vitest";
import { formatDirections, formatMarkingText, formatManualDirections } from "../../src/directions/format.js";
import type { Intersection, RouteResult, Coordinate } from "../../src/types.js";

const intersection: Intersection = {
  name: "Main St & Oak Ave",
  street1: "Main St",
  street2: "Oak Ave",
  lat: 33.0,
  lng: -97.0,
  county: "Tarrant",
  city: "Fort Worth",
  state: "Texas",
  stateCode: "TX",
  zip: "76101",
};

const destination: Coordinate = { lat: 33.005, lng: -96.995 };

const route: RouteResult = {
  steps: [
    {
      navigationInstruction: { maneuver: "DEPART", instructions: "Head north on Main St" },
      localizedValues: { distance: { text: "0.3 mi" }, duration: { text: "1 min" } },
      startLocation: { latLng: { latitude: 33.0, longitude: -97.0 } },
    },
    {
      navigationInstruction: { maneuver: "TURN_RIGHT", instructions: "Turn right onto Oak Ave" },
      localizedValues: { distance: { text: "0.1 mi" }, duration: { text: "1 min" } },
      startLocation: { latLng: { latitude: 33.003, longitude: -97.0 } },
    },
  ],
  distanceMeters: 700,
  localizedValues: { distance: { text: "0.4 mi" }, duration: { text: "2 min" } },
};

const coords: Coordinate[] = [
  { lat: 33.0, lng: -97.0 },
  { lat: 33.001, lng: -97.0 },
  { lat: 33.001, lng: -96.999 },
  { lat: 33.0, lng: -96.999 },
];

describe("formatDirections", () => {
  it("starts with the directions header", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result.startsWith("DIRECTIONS from Main St & Oak Ave, Fort Worth, TX 76101 to 33.005, -96.995")).toBe(true);
  });

  it("does not include the old county/city/intersection header block", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result).not.toContain("COUNTY");
    expect(result).not.toContain("CITY");
    expect(result).not.toContain("INTERSECTION:");
    expect(result).not.toContain("*************************");
  });

  it("includes numbered step instructions", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result).toMatch(/1\..+Main St/);
    expect(result).toMatch(/2\..+Oak Ave/);
  });

  it("includes area in acres", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result).toMatch(/Area: [\d.]+ acres/);
  });

  it("includes bounding box", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result).toMatch(/Bounding Box: \d+ feet .+ by \d+ feet/);
  });

  it("keeps Google's road heading for a single-step route (no off-road rewrite)", () => {
    const singleStep: RouteResult = {
      steps: [
        {
          navigationInstruction: { maneuver: "DEPART", instructions: "Head east on W Dove Rd" },
          localizedValues: { distance: { text: "0.2 mi" }, duration: { text: "1 min" } },
          startLocation: { latLng: { latitude: 32.9805, longitude: -97.2035 } },
        },
      ],
      distanceMeters: 320,
      localizedValues: { distance: { text: "0.2 mi" }, duration: { text: "1 min" } },
    };
    // destination sits to the NE of the step start; the old logic rewrote "east" -> "northeast".
    const offRoadDest: Coordinate = { lat: 32.9819, lng: -97.1988 };
    const result = formatDirections(intersection, offRoadDest, singleStep, coords);
    expect(result).toMatch(/1\..*Head east on W Dove Rd/);
    expect(result).not.toMatch(/Head northeast/);
  });

  it("appends an off-road final-approach note when provided", () => {
    const result = formatDirections(intersection, destination, route, coords, {
      distanceFeet: 250,
      cardinal: "north",
      roadName: "W Dove Rd",
    });
    expect(result).toContain("Work area is about 250 ft north off W Dove Rd");
    expect(result).toContain("enter the site (off-road)");
  });

  it("omits the final-approach note when not provided", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result).not.toContain("enter the site (off-road)");
  });
});

describe("formatManualDirections", () => {
  const entrance: Coordinate = { lat: 33.0, lng: -97.0 };
  // Two segments due east, then a 90-degree turn and two segments due north.
  const waypoints: Coordinate[] = [
    { lat: 33.0, lng: -96.99 },   // east
    { lat: 33.0, lng: -96.98 },   // east
    { lat: 33.01, lng: -96.98 },  // north (turn)
    { lat: 33.02, lng: -96.98 },  // north
  ];

  it("opens with a header routed to the entrance, not the polygon", () => {
    const result = formatManualDirections({ intersection, autoLeg: route, entrance, waypoints, polygon: coords });
    expect(result.startsWith("DIRECTIONS from Main St & Oak Ave, Fort Worth, TX 76101 to 33, -97")).toBe(true);
  });

  it("renders the auto intersection->gate leg as numbered steps", () => {
    const result = formatManualDirections({ intersection, autoLeg: route, entrance, waypoints, polygon: coords });
    expect(result).toMatch(/1\..+Main St/);
    expect(result).toMatch(/2\..+Oak Ave/);
  });

  it("collapses same-heading points into one step and starts a new step on a turn", () => {
    const result = formatManualDirections({ intersection, autoLeg: route, entrance, waypoints, polygon: coords });
    expect(result).toContain("Entrance/gate reached - proceed on-site to the work area:");
    // 4 waypoints -> 2 steps: the two east segments merge (step 3), the two
    // north segments merge (step 4). Auto leg has 2 steps, so these are 3 and 4.
    expect(result).toMatch(/3\. Head east \([^)]+\) to 33, -96\.98/);
    expect(result).toMatch(/4\. Head north \([^)]+\) to the work area at 33\.02, -96\.98/);
    expect(result).not.toMatch(/5\./);     // not one step per point
    expect(result).not.toContain("->");    // no leftover arrow style
  });

  it("collapses a fully collinear path into a single step", () => {
    const straight: Coordinate[] = [
      { lat: 33.0, lng: -96.99 },
      { lat: 33.0, lng: -96.98 },
      { lat: 33.0, lng: -96.97 },
    ];
    const result = formatManualDirections({ intersection, autoLeg: route, entrance, waypoints: straight, polygon: coords });
    expect(result).toMatch(/3\. Head east \([^)]+\) to the work area at 33, -96\.97/);
    expect(result).not.toMatch(/4\./);
  });

  it("appends the area/bounding-box trailer exactly once at the end", () => {
    const result = formatManualDirections({ intersection, autoLeg: route, entrance, waypoints, polygon: coords });
    expect((result.match(/Area: [\d.]+ acres/g) ?? [])).toHaveLength(1);
    expect((result.match(/Bounding Box:/g) ?? [])).toHaveLength(1);
    // trailer is last: nothing after the marking note
    expect(result.trimEnd().endsWith("use polygon coordinates below.")).toBe(true);
  });

  it("orders the legs: auto steps before the on-site separator before the trailer", () => {
    const result = formatManualDirections({ intersection, autoLeg: route, entrance, waypoints, polygon: coords });
    const stepIdx = result.indexOf("1.");
    const sepIdx = result.indexOf("Entrance/gate reached");
    const areaIdx = result.indexOf("Area:");
    expect(stepIdx).toBeGreaterThanOrEqual(0);
    expect(stepIdx).toBeLessThan(sepIdx);
    expect(sepIdx).toBeLessThan(areaIdx);
  });
});

describe("formatMarkingText", () => {
  it("includes start point", () => {
    const result = formatMarkingText(coords);
    expect(result).toContain("Start: 33, -97");
  });

  it("includes cardinal directions between points", () => {
    const result = formatMarkingText(coords);
    expect(result).toMatch(/NORTH/i);
    expect(result).toMatch(/EAST/i);
  });

  it("includes distances in feet", () => {
    const result = formatMarkingText(coords);
    expect(result).toMatch(/\d+ ft/);
  });

  it("mentions return to start", () => {
    const result = formatMarkingText(coords);
    expect(result).toContain("Returns to start");
  });

  it("includes point count in header", () => {
    const result = formatMarkingText(coords);
    expect(result).toContain("4 points");
  });

  it("ignores a duplicate closing point when looping back to the start", () => {
    const closedCoords: Coordinate[] = [
      ...coords,
      coords[0],
    ];

    const result = formatMarkingText(closedCoords);
    const toStartMatches = result.match(/to 33, -97/g) ?? [];

    expect(result).toContain("WORK AREA BOUNDARIES (4 points)");
    expect(result).not.toMatch(/0 ft to 33, -97/);
    expect(toStartMatches).toHaveLength(1);
  });
});
