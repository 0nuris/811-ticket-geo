import { describe, it, expect } from "vitest";
import { toPolygonWkt } from "../../src/geo/wkt.js";

describe("toPolygonWkt", () => {
  it("generates WKT with lng-lat order", () => {
    const coords = [
      { lat: 33.0, lng: -97.0 },
      { lat: 33.1, lng: -97.0 },
      { lat: 33.1, lng: -96.9 },
    ];
    const wkt = toPolygonWkt(coords);
    expect(wkt).toBe("POLYGON((-97 33,-97 33.1,-96.9 33.1,-97 33))");
  });

  it("does not double-close an already closed ring", () => {
    const coords = [
      { lat: 33.0, lng: -97.0 },
      { lat: 33.1, lng: -97.0 },
      { lat: 33.1, lng: -96.9 },
      { lat: 33.0, lng: -97.0 },
    ];
    const wkt = toPolygonWkt(coords);
    expect(wkt).toBe("POLYGON((-97 33,-97 33.1,-96.9 33.1,-97 33))");
  });
});
