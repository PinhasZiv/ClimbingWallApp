import type { Hold } from '../types/models';
import type { Point } from '../lib/geometry';
import type { DetectRawHold } from './pipeline';
import { autoHoldId, dedupeIds } from './mergeResults';

/** Scale raw detection-space holds up into the canonical photo's coordinate space and assign ids. */
export function rawHoldsToHolds(raw: DetectRawHold[], scaleFactor: number): Hold[] {
  const withIds: Hold[] = raw.map((r) => {
    const centroid: Point = [r.centroid[0] * scaleFactor, r.centroid[1] * scaleFactor];
    return {
      id: autoHoldId(centroid),
      polygon: r.polygon.map(([x, y]) => [x * scaleFactor, y * scaleFactor] as Point),
      centroid,
      bbox: [
        r.bbox[0] * scaleFactor,
        r.bbox[1] * scaleFactor,
        r.bbox[2] * scaleFactor,
        r.bbox[3] * scaleFactor,
      ],
      areaPx: r.areaPx * scaleFactor * scaleFactor,
      meanColorLab: r.meanColorLab,
      source: 'auto',
    };
  });
  return dedupeIds(withIds);
}
