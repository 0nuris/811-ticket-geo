import type { Coordinate, BoundingBox } from "../types.js";
import { geoMeasure } from "./measure.js";

const METERS_TO_FEET = 3.28084;
const SQ_METERS_TO_ACRES = 1 / 4046.86;

export function polygonAreaAcres(coordinates: Coordinate[]): number {
  const n = coordinates.length;
  if (n < 3) return 0;

  const refLat = coordinates[0].lat;
  const refLng = coordinates[0].lng;

  const xs: number[] = [0];
  const ys: number[] = [0];

  for (let i = 1; i < n; i++) {
    const c = coordinates[i];
    const { distanceMeters: dy } = geoMeasure(
      { lat: refLat, lng: refLng },
      { lat: c.lat, lng: refLng }
    );
    const { distanceMeters: dx } = geoMeasure(
      { lat: refLat, lng: refLng },
      { lat: refLat, lng: c.lng }
    );
    xs.push(c.lng < refLng ? -dx : dx);
    ys.push(c.lat < refLat ? -dy : dy);
  }

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += xs[i] * ys[j] - xs[j] * ys[i];
  }

  return (Math.abs(area) / 2) * SQ_METERS_TO_ACRES;
}

export function boundingBoxFeet(coordinates: Coordinate[]): BoundingBox {
  if (coordinates.length === 0) return { northSouthFeet: 0, eastWestFeet: 0 };
  const lats = coordinates.map((c) => c.lat);
  const lngs = coordinates.map((c) => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;

  const { distanceMeters: nsMeters } = geoMeasure(
    { lat: minLat, lng: midLng },
    { lat: maxLat, lng: midLng }
  );
  const { distanceMeters: ewMeters } = geoMeasure(
    { lat: midLat, lng: minLng },
    { lat: midLat, lng: maxLng }
  );

  return {
    northSouthFeet: nsMeters * METERS_TO_FEET,
    eastWestFeet: ewMeters * METERS_TO_FEET,
  };
}
