import type { Coordinate } from "./types.js";

/** A named area such as a city, as rings parsed from its boundary. */
export interface NamedArea {
  name: string;
  rings: Coordinate[][];
}

export interface PlaceMatch {
  name: string;
  /** Share of the work area inside the place; 0 when it lies in none and this is the nearest. */
  share: number;
  /** 0 when the work area overlaps the place. */
  distanceMeters: number;
}

const SAMPLE_POINTS = 400;

/** Every ring of a POLYGON or MULTIPOLYGON in longitude/latitude WKT, holes included. */
export function parseWktRings(wkt: string): Coordinate[][] {
  return [...String(wkt).matchAll(/\(([^()]+)\)/g)].map((m) =>
    m[1].split(",").map((pair) => {
      const [lng, lat] = pair.trim().split(/\s+/).map(Number);
      return { lat, lng };
    })
  );
}

/**
 * The place covering most of the work area, or the nearest place when it lies in
 * none (unincorporated). See docs/decisions.md, "Ticket county and place".
 */
export function placeForWorkArea(workArea: Coordinate[], places: NamedArea[]): PlaceMatch | null {
  const candidates = places.filter((p) => p.rings.length > 0).map((p) => ({ ...p, box: boundingBox(p.rings.flat()) }));
  if (candidates.length === 0 || workArea.length === 0) return null;

  const points = samplePoints(workArea);
  const counts = new Map<string, number>();
  for (const point of points) {
    for (const place of candidates) {
      if (inBox(point, place.box) && inRings(point, place.rings)) counts.set(place.name, (counts.get(place.name) ?? 0) + 1);
    }
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (top) return { name: top[0], share: top[1] / points.length, distanceMeters: 0 };

  let best: PlaceMatch | null = null;
  const byBox = candidates
    .map((p) => ({ place: p, bound: Math.min(...workArea.map((v) => boxDistanceMeters(v, p.box))) }))
    .sort((a, b) => a.bound - b.bound);
  for (const { place, bound } of byBox) {
    if (best && bound >= best.distanceMeters) break;
    const d = Math.min(...workArea.map((v) => ringsDistanceMeters(v, place.rings)));
    if (!best || d < best.distanceMeters) best = { name: place.name, share: 0, distanceMeters: d };
  }
  return best;
}

interface Box {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function boundingBox(points: Coordinate[]): Box {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}

function inBox(p: Coordinate, b: Box): boolean {
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}

/** Even-odd over all rings, so holes and multipolygon parts both count correctly. */
function inRings(p: Coordinate, rings: Coordinate[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** A grid of points inside the work area; its vertices when the grid misses it. */
function samplePoints(workArea: Coordinate[]): Coordinate[] {
  const box = boundingBox(workArea);
  const step = Math.sqrt(((box.maxLng - box.minLng) * (box.maxLat - box.minLat)) / SAMPLE_POINTS);
  const points: Coordinate[] = [];
  if (step > 0) {
    for (let lng = box.minLng + step / 2; lng < box.maxLng; lng += step) {
      for (let lat = box.minLat + step / 2; lat < box.maxLat; lat += step) {
        if (inRings({ lat, lng }, [workArea])) points.push({ lat, lng });
      }
    }
  }
  return points.length > 0 ? points : workArea;
}

const METERS_PER_DEGREE_LAT = 110_540;

function toMeters(p: Coordinate, refLat: number): [number, number] {
  return [p.lng * 111_320 * Math.cos((refLat * Math.PI) / 180), p.lat * METERS_PER_DEGREE_LAT];
}

function segmentDistanceMeters(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const [px, py] = toMeters(p, p.lat);
  const [ax, ay] = toMeters(a, p.lat);
  const [bx, by] = toMeters(b, p.lat);
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function ringsDistanceMeters(p: Coordinate, rings: Coordinate[][]): number {
  let best = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) best = Math.min(best, segmentDistanceMeters(p, ring[i - 1], ring[i]));
  return best;
}

/** Never more than the distance to anything inside the box. */
function boxDistanceMeters(p: Coordinate, b: Box): number {
  const lat = Math.max(b.minLat, Math.min(p.lat, b.maxLat));
  const lng = Math.max(b.minLng, Math.min(p.lng, b.maxLng));
  const [px, py] = toMeters(p, p.lat);
  const [qx, qy] = toMeters({ lat, lng }, p.lat);
  return Math.hypot(px - qx, py - qy);
}
