export type Point = [number, number];

/** Ray-casting point-in-polygon test, in image pixel coordinates. */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function makeCirclePolygon(center: Point, radius: number, segments = 24): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return points;
}

export function polygonBBox(polygon: Point[]): [number, number, number, number] {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];
}

export function polygonCentroid(polygon: Point[]): Point {
  const sum = polygon.reduce<Point>(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]);
  return [sum[0] / polygon.length, sum[1] / polygon.length];
}

/** Shoelace formula. */
export function polygonArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
  }
  return Math.abs(sum) / 2;
}

/** Andrew's monotone-chain convex hull. Used for the Merge tool (spec: "convex hull of both polygons"). */
export function convexHull(points: Point[]): Point[] {
  const pts = [...new Set(points.map((p) => `${p[0]},${p[1]}`))].map((s) => {
    const [x, y] = s.split(',').map(Number);
    return [x, y] as Point;
  });
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;

  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Cut a simple polygon into two by an infinite line through lineA/lineB (Sutherland-Hodgman
 * style clip against both half-planes). Returns null if the line doesn't actually cross the
 * polygon into two valid (>=3 vertex) pieces — the Split tool no-ops in that case.
 */
export function splitPolygonByLine(polygon: Point[], lineA: Point, lineB: Point): [Point[], Point[]] | null {
  const side = (p: Point) =>
    (lineB[0] - lineA[0]) * (p[1] - lineA[1]) - (lineB[1] - lineA[1]) * (p[0] - lineA[0]);
  const intersect = (p1: Point, p2: Point): Point => {
    const s1 = side(p1);
    const s2 = side(p2);
    const t = s1 / (s1 - s2);
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };

  const left: Point[] = [];
  const right: Point[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    const sCurr = side(curr);
    const sNext = side(next);
    if (sCurr >= 0) left.push(curr);
    if (sCurr <= 0) right.push(curr);
    if ((sCurr > 0 && sNext < 0) || (sCurr < 0 && sNext > 0)) {
      const ip = intersect(curr, next);
      left.push(ip);
      right.push(ip);
    }
  }
  if (left.length < 3 || right.length < 3) return null;
  return [left, right];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Sort holds top-to-bottom then left-to-right for stable ordering across re-runs: bucket
 * into rows by y-proximity (within rowHeightFrac of the median hold height) rather than a
 * strict y-sort, since two holds a couple of pixels apart vertically read as "the same row".
 */
export function sortHoldsRowMajor<T extends { centroid: Point; bbox: [number, number, number, number] }>(
  holds: T[],
  rowHeightFrac = 0.6,
): T[] {
  if (holds.length === 0) return [];
  const medianHeight = median(holds.map((h) => h.bbox[3])) || 1;
  const rowThreshold = medianHeight * rowHeightFrac;

  const byY = [...holds].sort((a, b) => a.centroid[1] - b.centroid[1]);
  const rows: T[][] = [];
  let currentRow: T[] = [byY[0]];
  let rowY = byY[0].centroid[1];

  for (let i = 1; i < byY.length; i++) {
    const hold = byY[i];
    if (hold.centroid[1] - rowY > rowThreshold) {
      rows.push(currentRow);
      currentRow = [hold];
      rowY = hold.centroid[1];
    } else {
      currentRow.push(hold);
    }
  }
  rows.push(currentRow);

  return rows.flatMap((row) => row.sort((a, b) => a.centroid[0] - b.centroid[0]));
}
