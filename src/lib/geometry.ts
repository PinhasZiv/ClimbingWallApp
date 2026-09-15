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
