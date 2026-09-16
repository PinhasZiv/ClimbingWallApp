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
