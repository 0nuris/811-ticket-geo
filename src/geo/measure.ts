import type { Coordinate, GeoMeasurement } from "../types.js";

export function geoMeasure(from: Coordinate, to: Coordinate): GeoMeasurement {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const deltaLat = toRad(to.lat - from.lat);
  const deltaLng = toRad(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const distanceMeters = 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const x = Math.sin(deltaLng) * Math.cos(lat2);
  const y =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  const bearingDegrees = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;

  return { distanceMeters, bearingDegrees };
}

const CARDINALS = [
  "north", "northeast", "east", "southeast",
  "south", "southwest", "west", "northwest",
] as const;

export function bearingToCardinal(degrees: number): string {
  const index = Math.floor(((degrees + 22.5) % 360) / 45);
  return CARDINALS[index];
}
