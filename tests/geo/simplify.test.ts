import { describe, it, expect } from "vitest";
import { simplifyPolygon } from "../../src/geo/simplify.js";
import type { Coordinate } from "../../src/types.js";

function generateCircle(center: Coordinate, radiusDeg: number, numPoints: number): Coordinate[] {
  const points: Coordinate[] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    points.push({
      lat: center.lat + radiusDeg * Math.sin(angle),
      lng: center.lng + radiusDeg * Math.cos(angle),
    });
  }
  return points;
}

describe("simplifyPolygon", () => {
  it("returns input unchanged when points <= maxPoints", () => {
    const coords = [
      { lat: 33.0, lng: -97.0 },
      { lat: 33.1, lng: -97.0 },
      { lat: 33.1, lng: -96.9 },
    ];
    const result = simplifyPolygon(coords, 15);
    expect(result).toHaveLength(3);
  });

  it("reduces a 50-point circle to maxPoints", () => {
    const circle = generateCircle({ lat: 33.0, lng: -97.0 }, 0.01, 50);
    const result = simplifyPolygon(circle, 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("strips duplicate closing point before simplification", () => {
    const coords = [
      { lat: 33.0, lng: -97.0 },
      { lat: 33.1, lng: -97.0 },
      { lat: 33.1, lng: -96.9 },
      { lat: 33.0, lng: -97.0 },
    ];
    const result = simplifyPolygon(coords, 15);
    expect(result).toHaveLength(3);
  });

  it("defaults maxPoints to 15", () => {
    const circle = generateCircle({ lat: 33.0, lng: -97.0 }, 0.01, 50);
    const result = simplifyPolygon(circle);
    expect(result.length).toBeLessThanOrEqual(15);
  });
});
