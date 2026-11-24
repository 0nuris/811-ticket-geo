import { describe, it, expect } from "vitest";
import { parseWktRings, placeForWorkArea, type NamedArea } from "../src/places.js";

const square = (lng0: number, lat0: number, size: number) =>
  `(${lng0} ${lat0},${lng0 + size} ${lat0},${lng0 + size} ${lat0 + size},${lng0} ${lat0 + size},${lng0} ${lat0})`;
const area = (name: string, wkt: string): NamedArea => ({ name, rings: parseWktRings(wkt) });
const workArea = (lng0: number, lat0: number, w: number, h: number) => [
  { lat: lat0, lng: lng0 },
  { lat: lat0, lng: lng0 + w },
  { lat: lat0 + h, lng: lng0 + w },
  { lat: lat0 + h, lng: lng0 },
];

describe("parseWktRings", () => {
  it("reads a polygon and every part and hole of a multipolygon", () => {
    expect(parseWktRings(`POLYGON(${square(-97, 33, 1)})`)).toHaveLength(1);
    const multi = parseWktRings(`MULTIPOLYGON((${square(-97, 33, 1)},${square(-96.8, 33.2, 0.2)}),(${square(-95, 33, 1)}))`);
    expect(multi).toHaveLength(3);
    expect(multi[0][1]).toEqual({ lat: 33, lng: -96 });
  });
});

describe("placeForWorkArea", () => {
  const richardson = area("RICHARDSON", `POLYGON(${square(-96.70, 32.98, 0.05)})`);
  const garland = area("GARLAND", `POLYGON(${square(-96.65, 32.98, 0.05)})`);

  it("picks the place covering most of a work area that straddles a city line", () => {
    const match = placeForWorkArea(workArea(-96.653, 33.0, 0.01, 0.005), [richardson, garland]);
    expect(match?.name).toBe("GARLAND");
    expect(match?.share).toBeGreaterThan(0.6);
    expect(match?.distanceMeters).toBe(0);
  });

  it("names the nearest place for an unincorporated work area", () => {
    const rural = workArea(-96.58, 33.0, 0.002, 0.002);
    const match = placeForWorkArea(rural, [richardson, garland]);
    expect(match).toMatchObject({ name: "GARLAND", share: 0 });
    // 0.02 degrees of longitude at 33 N
    expect(match!.distanceMeters).toBeGreaterThan(1800);
    expect(match!.distanceMeters).toBeLessThan(1950);
  });

  it("does not count a work area inside a hole in the place", () => {
    const withHole = area("ANNA", `POLYGON(${square(-96.6, 33.3, 0.1)},${square(-96.56, 33.34, 0.02)})`);
    const melissa = area("MELISSA", `POLYGON(${square(-96.56, 33.34, 0.02)})`);
    expect(placeForWorkArea(workArea(-96.555, 33.345, 0.005, 0.005), [withHole, melissa])?.name).toBe("MELISSA");
  });

  it("returns null with no places or an empty work area", () => {
    expect(placeForWorkArea(workArea(-96.6, 33, 0.01, 0.01), [])).toBeNull();
    expect(placeForWorkArea([], [richardson])).toBeNull();
    expect(placeForWorkArea(workArea(-96.6, 33, 0.01, 0.01), [{ name: "EMPTY", rings: [] }])).toBeNull();
  });
});
