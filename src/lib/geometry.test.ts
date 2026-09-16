import { describe, expect, it } from 'vitest';
import { convexHull, pointInPolygon, polygonArea, splitPolygonByLine, type Point } from './geometry';

describe('pointInPolygon', () => {
  const square: Point[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  it('is true for a point inside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
  });
  it('is false for a point outside', () => {
    expect(pointInPolygon([15, 5], square)).toBe(false);
  });
});

describe('convexHull', () => {
  it('drops interior points, keeping only the boundary', () => {
    const points: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5], // interior — should not survive
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([5, 5]);
  });

  it('merges two separate squares into their combined hull', () => {
    const squareA: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    const squareB: Point[] = [
      [6, 0],
      [10, 0],
      [10, 4],
      [6, 4],
    ];
    const hull = convexHull([...squareA, ...squareB]);
    // combined bounding shape spans x in [0,10], y in [0,4]
    const xs = hull.map((p) => p[0]);
    const ys = hull.map((p) => p[1]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(10);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(4);
  });
});

describe('splitPolygonByLine', () => {
  it('splits a square in half with a vertical line down the middle', () => {
    const square: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const result = splitPolygonByLine(square, [5, -5], [5, 15]);
    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(polygonArea(a)).toBeCloseTo(50, 5);
    expect(polygonArea(b)).toBeCloseTo(50, 5);
    expect(polygonArea(a) + polygonArea(b)).toBeCloseTo(polygonArea(square), 5);
  });

  it('returns null when the line misses the polygon entirely', () => {
    const square: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const result = splitPolygonByLine(square, [100, -5], [100, 15]);
    expect(result).toBeNull();
  });
});
