import { describe, it, expect } from "vitest";
import {
  isLimitedAccessRoad,
  routePenaltyMeters,
  selectionScore,
  ringPoints,
  roadNamePairs,
  stepRoad,
  stepTowardRoad,
  routeJunctions,
  pointBeyond,
  ROUTE_PENALTY_METERS,
  OFFROAD_WEIGHT,
} from "../src/selection.js";
import { geoMeasure } from "../src/geo/measure.js";
import type { Intersection, RouteResult } from "../src/types.js";

const local: Intersection = {
  name: "Basswood Blvd & Candler Dr", street1: "Basswood Blvd", street2: "Candler Dr",
  lat: 32.9, lng: -97.3, county: "Tarrant", city: "Fort Worth", state: "Texas", stateCode: "TX", zip: "76131",
};

function step(maneuver: string, instructions: string, lat = 32.9, lng = -97.3) {
  return { navigationInstruction: { maneuver, instructions }, startLocation: { latLng: { latitude: lat, longitude: lng } } };
}

describe("isLimitedAccessRoad", () => {
  it.each(["I-20", "I- 35 W", "IH-20 W", "Interstate 30", "Dallas North Tollway", "President George Bush Tpke", "Sam Rayburn Fwy", "Ronald Reagan Memorial Highway"])(
    "treats %s as limited access", (name) => expect(isLimitedAccessRoad(name)).toBe(true)
  );
  it.each(["I-20 Frontage Rd", "N Freeway Svc Rd E", "Hwy 75 Access Rd", "US Hwy 287", "State Hwy 114", "Main St"])(
    "treats %s as a local road", (name) => expect(isLimitedAccessRoad(name)).toBe(false)
  );
});

describe("routePenaltyMeters", () => {
  it("is zero for a surface-street drive", () => {
    const route: RouteResult = { distanceMeters: 300, steps: [step("DEPART", "Head north on Main St"), step("TURN_LEFT", "Turn left onto Oak Ave")] };
    expect(routePenaltyMeters(route, local)).toBe(0);
  });

  it("adds ramps, merges, a toll road, U-turns and an interchange start", () => {
    // Ticket 2681624558 (Frisco): Eldorado Pkwy & Dallas Pkwy routed 3.3 mi via the tollway.
    const route: RouteResult = {
      distanceMeters: 5315,
      steps: [
        step("DEPART", "Head west on Eldorado Pkwy"),
        step("UTURN_LEFT", "Make a U-turn at Dallas Pkwy"),
        step("RAMP_LEFT", "Take the ramp onto Dallas North Tollway"),
        step("MERGE", "Merge onto Dallas North Tollway N\nToll road"),
      ],
    };
    const interchange = { ...local, street1: "Eldorado Pkwy", street2: "Dallas North Tollway" };
    const { rampOrMerge, toll, uturn, limitedAccessStart } = ROUTE_PENALTY_METERS;
    expect(routePenaltyMeters(route, interchange)).toBe(2 * rampOrMerge + toll + uturn + limitedAccessStart);
  });
});

describe("selectionScore", () => {
  it("adds the weighted walk from where the drive stops to the vertex", () => {
    const vertex = { lat: 32.9, lng: -97.3 };
    const end = { lat: 32.9009, lng: -97.3 }; // ~100 m north
    const route: RouteResult = { distanceMeters: 400, steps: [step("DEPART", "Head north on Main St")], endLocation: end };
    const walk = geoMeasure(end, vertex).distanceMeters;
    expect(selectionScore(route, local, vertex)).toBeCloseTo(400 + OFFROAD_WEIGHT * walk, 6);
  });
});

describe("ringPoints / pointBeyond", () => {
  it("spaces points on the radius", () => {
    const center = { lat: 32.94, lng: -97.25 };
    const points = ringPoints(center, 1.5, 8);
    expect(points).toHaveLength(8);
    for (const p of points) expect(geoMeasure(center, p).distanceMeters).toBeGreaterThan(1480);
    for (const p of points) expect(geoMeasure(center, p).distanceMeters).toBeLessThan(1520);
  });

  it("steps outward past a vertex, away from the center", () => {
    const center = { lat: 32.94, lng: -97.25 };
    const vertex = { lat: 32.945, lng: -97.245 };
    const beyond = pointBeyond(center, vertex, 75);
    expect(geoMeasure(vertex, beyond).distanceMeters).toBeGreaterThan(73);
    expect(geoMeasure(vertex, beyond).distanceMeters).toBeLessThan(77);
    expect(geoMeasure(center, beyond).distanceMeters).toBeGreaterThan(geoMeasure(center, vertex).distanceMeters);
  });
});

describe("roadNamePairs", () => {
  it("drops unnamed roads, freeways and repeats, and pairs near roads first", () => {
    const pairs = roadNamePairs(["Aledo Road", "Bentley Road", "aledo road", "Unnamed Road", "Interstate 20", "Markum Ranch Rd", "Ronald Reagan Memorial Highway"], 10);
    expect(pairs).toEqual([
      ["Aledo Road", "Bentley Road"],
      ["Aledo Road", "Markum Ranch Rd"],
      ["Bentley Road", "Markum Ranch Rd"],
    ]);
  });

  it("caps the number of pairs", () => {
    expect(roadNamePairs(["A St", "B St", "C St", "D St", "E St"], 4)).toHaveLength(4);
  });
});

describe("route junctions", () => {
  it("reads the road a step puts you on and the one it heads toward", () => {
    expect(stepRoad("Turn left onto Domingo Dr")).toBe("Domingo Dr");
    expect(stepRoad("Head west on Walsh Ave toward Crescent St")).toBe("Walsh Ave");
    expect(stepRoad("Merge onto I-30 Frontage Rd/West Freeway")).toBe("I-30 Frontage Rd");
    expect(stepRoad("Turn left")).toBeNull();
    expect(stepTowardRoad("Head west on Aledo Rd toward Aledo Connector Rd\nDestination will be on the right")).toBe("Aledo Connector Rd");
  });

  it("lists junctions nearest the destination first", () => {
    // Ticket 2681951640 (Parker): the route from Walsh Ave passes Rozana St & Theodora Ln.
    const route: RouteResult = {
      distanceMeters: 1399,
      steps: [
        step("DEPART", "Head west on Walsh Ave toward Crescent St", 32.73, -97.57),
        step("TURN_LEFT", "Turn left onto Domingo Dr", 32.731, -97.575),
        step("TURN_LEFT", "Turn left onto Rozana St", 32.728, -97.578),
        step("TURN_RIGHT", "Turn right onto Theodora Ln", 32.726, -97.579),
      ],
    };
    const junctions = routeJunctions(route);
    expect(junctions[0]).toEqual({ roads: ["Rozana St", "Theodora Ln"], at: { lat: 32.726, lng: -97.579 } });
    expect(junctions.map((j) => j.roads.join(" & "))).toContain("Walsh Ave & Crescent St");
  });
});
