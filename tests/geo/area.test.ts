import { describe, it, expect } from "vitest";
import { polygonAreaAcres, boundingBoxFeet } from "../../src/geo/area.js";

describe("polygonAreaAcres", () => {
  it("returns 0 for fewer than 3 points", () => {
    expect(polygonAreaAcres([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toBe(0);
  });

  it("returns 0 for an empty array", () => {
    expect(polygonAreaAcres([])).toBe(0);
  });

  it("computes approximate area for a known polygon", () => {
    const side = 0.000573;
    const coords = [
      { lat: 33.0, lng: -97.0 },
      { lat: 33.0, lng: -97.0 + side },
      { lat: 33.0 + side, lng: -97.0 + side },
      { lat: 33.0 + side, lng: -97.0 },
    ];
    const area = polygonAreaAcres(coords);
    expect(area).toBeGreaterThan(0.8);
    expect(area).toBeLessThan(1.2);
  });
});

describe("boundingBoxFeet", () => {
  it("computes bounding box dimensions", () => {
    const coords = [
      { lat: 33.0, lng: -97.0 },
      { lat: 33.001, lng: -97.0 },
      { lat: 33.001, lng: -96.999 },
      { lat: 33.0, lng: -96.999 },
    ];
    const box = boundingBoxFeet(coords);
    expect(box.northSouthFeet).toBeGreaterThan(300);
    expect(box.northSouthFeet).toBeLessThan(400);
    expect(box.eastWestFeet).toBeGreaterThan(250);
    expect(box.eastWestFeet).toBeLessThan(350);
  });
});
