import type { Coordinate } from "../types.js";

function cross2d(o: Coordinate, a: Coordinate, b: Coordinate): number {
  return (
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng)
  );
}

function convexHull(points: Coordinate[]): Coordinate[] {
  const sorted = [...points].sort(
    (a, b) => a.lng - b.lng || a.lat - b.lat
  );

  const lower: Coordinate[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2d(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Coordinate[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2d(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function visvalingam(coords: Coordinate[], maxPoints: number): Coordinate[] {
  const n = coords.length;
  if (n <= maxPoints) return coords;

  const prev = Array.from({ length: n }, (_, i) => (i - 1 + n) % n);
  const next = Array.from({ length: n }, (_, i) => (i + 1) % n);
  const alive = new Array(n).fill(true);
  const generation = new Array(n).fill(0);
  let size = n;

  function cornerArea(i: number): number {
    return Math.abs(cross2d(coords[prev[i]], coords[i], coords[next[i]])) / 2;
  }

  type HeapEntry = [number, number, number];
  const heap: HeapEntry[] = [];

  function heapPush(entry: HeapEntry) {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  }

  function heapPop(): HeapEntry {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  }

  for (let i = 0; i < n; i++) {
    heapPush([cornerArea(i), generation[i], i]);
  }

  while (size > maxPoints && heap.length > 0) {
    const [area, gen, i] = heapPop();
    if (!alive[i] || gen !== generation[i]) continue;

    const p = prev[i];
    const nx = next[i];
    next[p] = nx;
    prev[nx] = p;
    alive[i] = false;
    size--;

    for (const nb of [p, nx]) {
      if (alive[nb]) {
        generation[nb]++;
        heapPush([cornerArea(nb), generation[nb], nb]);
      }
    }
  }

  const result: Coordinate[] = [];
  const start = alive.indexOf(true);
  let i = start;
  do {
    result.push(coords[i]);
    i = next[i];
  } while (i !== start);

  return result;
}

function signedArea(coords: Coordinate[]): number {
  const origin = coords[0];
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    area += cross2d(origin, coords[i], coords[(i + 1) % coords.length]);
  }
  return area / 2;
}

function pointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  const x = point.lng;
  const y = point.lat;
  const n = polygon.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function enforceContainment(simplified: Coordinate[], original: Coordinate[]): Coordinate[] {
  const n = simplified.length;
  const ccw = signedArea(simplified) > 0;

  const normals: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = simplified[j].lng - simplified[i].lng;
    const dy = simplified[j].lat - simplified[i].lat;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) {
      normals.push([0, 0]);
    } else if (ccw) {
      normals.push([dy / length, -dx / length]);
    } else {
      normals.push([-dy / length, dx / length]);
    }
  }

  const edgeOffset = new Array(n).fill(0);
  for (const p of original) {
    if (pointInPolygon(p, simplified)) continue;
    for (let ei = 0; ei < n; ei++) {
      const a = simplified[ei];
      const [nx, ny] = normals[ei];
      const signedDist = (p.lng - a.lng) * nx + (p.lat - a.lat) * ny;
      if (signedDist > edgeOffset[ei]) {
        edgeOffset[ei] = signedDist;
      }
    }
  }

  const buffer = 0.000003;
  return simplified.map((vertex, i) => {
    const prevEdge = (i - 1 + n) % n;
    const currEdge = i;
    let dlng = 0;
    let dlat = 0;

    for (const ei of [prevEdge, currEdge]) {
      if (edgeOffset[ei] > 0) {
        const [nx, ny] = normals[ei];
        dlng += nx * (edgeOffset[ei] + buffer);
        dlat += ny * (edgeOffset[ei] + buffer);
      }
    }

    return { lat: vertex.lat + dlat, lng: vertex.lng + dlng };
  });
}

export function simplifyPolygon(
  points: Coordinate[],
  maxPoints: number = 15
): Coordinate[] {
  let openPoints = points;
  if (
    points.length > 1 &&
    points[0].lat === points[points.length - 1].lat &&
    points[0].lng === points[points.length - 1].lng
  ) {
    openPoints = points.slice(0, -1);
  }

  if (openPoints.length <= maxPoints) return openPoints;

  let hull = convexHull(openPoints);

  if (hull.length > maxPoints) {
    hull = visvalingam(hull, maxPoints);
  }

  function allContained(polygon: Coordinate[], originals: Coordinate[]): boolean {
    const vertexSet = new Set(polygon.map((v) => `${v.lat},${v.lng}`));
    for (const p of originals) {
      if (vertexSet.has(`${p.lat},${p.lng}`)) continue;
      if (!pointInPolygon(p, polygon)) return false;
    }
    return true;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    if (allContained(hull, openPoints)) break;
    hull = enforceContainment(hull, openPoints);
  }

  return hull;
}
