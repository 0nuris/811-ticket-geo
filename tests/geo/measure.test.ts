import { describe, it, expect } from "vitest";
import { geoMeasure, bearingToCardinal } from "../../src/geo/measure.js";

describe("geoMeasure", () => {
  it("returns zero distance and zero bearing for identical points", () => {
    const result = geoMeasure({ lat: 33.0, lng: -97.0 }, { lat: 33.0, lng: -97.0 });
    expect(result.distanceMeters).toBe(0);
    expect(result.bearingDegrees).toBe(0);
  });

  it("computes distance between two known points", () => {
    const result = geoMeasure(
      { lat: 32.7767, lng: -96.7970 },
      { lat: 32.7555, lng: -97.3308 }
    );
    expect(result.distanceMeters).toBeGreaterThan(48000);
    expect(result.distanceMeters).toBeLessThan(50000);
  });

  it("computes bearing due north as ~0 degrees", () => {
    const result = geoMeasure({ lat: 32.0, lng: -97.0 }, { lat: 33.0, lng: -97.0 });
    expect(result.bearingDegrees).toBeCloseTo(0, 0);
  });

  it("computes bearing due east as ~90 degrees", () => {
    const result = geoMeasure({ lat: 32.0, lng: -97.0 }, { lat: 32.0, lng: -96.0 });
    expect(result.bearingDegrees).toBeCloseTo(90, 0);
  });

  it("computes bearing due south as ~180 degrees", () => {
    const result = geoMeasure({ lat: 33.0, lng: -97.0 }, { lat: 32.0, lng: -97.0 });
    expect(result.bearingDegrees).toBeCloseTo(180, 0);
  });

  it("computes bearing due west as ~270 degrees", () => {
    const result = geoMeasure({ lat: 32.0, lng: -96.0 }, { lat: 32.0, lng: -97.0 });
    expect(result.bearingDegrees).toBeCloseTo(270, 0);
  });
});

describe("bearingToCardinal", () => {
  it.each([
    [0, "north"],
    [45, "northeast"],
    [90, "east"],
    [135, "southeast"],
    [180, "south"],
    [225, "southwest"],
    [270, "west"],
    [315, "northwest"],
    [359, "north"],
    [22, "north"],
    [23, "northeast"],
  ])("converts %d degrees to %s", (degrees, expected) => {
    expect(bearingToCardinal(degrees as number)).toBe(expected);
  });
});
