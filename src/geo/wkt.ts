import type { Coordinate } from "../types.js";

export function toPolygonWkt(coordinates: Coordinate[]): string {
  if (coordinates.length === 0) return "POLYGON EMPTY";
  const pairs = coordinates.map((c) => `${c.lng} ${c.lat}`);

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) {
    pairs.push(`${first.lng} ${first.lat}`);
  }

  return `POLYGON((${pairs.join(",")}))`;
}
