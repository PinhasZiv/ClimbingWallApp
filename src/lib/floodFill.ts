import { convexHull, type Point } from './geometry';
import { rgbToOpenCvLab8u } from './color';

/**
 * Flood-fill from a tapped point, bounded by "not wall colour" (same deltaE test the detector
 * uses), to snap a manually-added hold to its real shape. Returns null — signaling the caller
 * to fall back to a fixed-radius circle — when the tap landed on bare wall, the fill is too
 * small to be a hold, or it "runs away" past maxPixels (a busy photo with no clean edge).
 *
 * Samples on a coarse grid (`step` px) rather than every pixel: this runs synchronously on the
 * main thread in response to a tap, and a hold-sized region at a few-px grid is plenty of
 * resolution for a convex-hull approximation of its outline.
 */
export function floodFillHold(
  seed: Point,
  sample: (x: number, y: number) => [number, number, number],
  wallLab: [number, number, number],
  bgDeltaE: number,
  imageWidth: number,
  imageHeight: number,
  maxPixels: number,
  step = 4,
): Point[] | null {
  const thresholdSq = bgDeltaE * bgDeltaE;

  function isHoldPixel(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= imageWidth || y >= imageHeight) return false;
    const [r, g, b] = sample(x, y);
    const [l, a, bLab] = rgbToOpenCvLab8u(r, g, b);
    const dl = l - wallLab[0];
    const da = a - wallLab[1];
    const db = bLab - wallLab[2];
    return dl * dl + da * da + db * db > thresholdSq;
  }

  const startX = Math.round(seed[0] / step) * step;
  const startY = Math.round(seed[1] / step) * step;
  if (!isHoldPixel(startX, startY)) return null;

  const visited = new Set<string>();
  const queue: Point[] = [[startX, startY]];
  const filled: Point[] = [];

  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!isHoldPixel(x, y)) continue;

    filled.push([x, y]);
    if (filled.length > maxPixels) return null;

    for (const [dx, dy] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!visited.has(`${nx},${ny}`)) queue.push([nx, ny]);
    }
  }

  if (filled.length < 4) return null;
  return convexHull(filled);
}
