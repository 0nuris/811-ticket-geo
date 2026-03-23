import { describe, it, expect } from "vitest";
import { formatDirections, formatMarkingText } from "../../src/directions/format.js";
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
  it("includes the intersection name in header", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result).toContain("Main St & Oak Ave");
  });

  it("includes county and city", () => {
    const result = formatDirections(intersection, destination, route, coords);
    expect(result).toContain("Tarrant");
    expect(result).toContain("Fort Worth");
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
});
