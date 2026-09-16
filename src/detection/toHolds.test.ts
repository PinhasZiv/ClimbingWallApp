import { describe, expect, it } from 'vitest';
import { rawHoldsToHolds } from './toHolds';
import type { DetectRawHold } from './pipeline';

describe('rawHoldsToHolds', () => {
  it('scales geometry up by scaleFactor and area by scaleFactor^2', () => {
    const raw: DetectRawHold[] = [
      {
        polygon: [
          [10, 10],
          [20, 10],
          [20, 20],
          [10, 20],
        ],
        centroid: [15, 15],
        bbox: [10, 10, 10, 10],
        areaPx: 100,
        meanColorLab: [1, 2, 3],
      },
    ];
    const [hold] = rawHoldsToHolds(raw, 2);
    expect(hold.centroid).toEqual([30, 30]);
    expect(hold.polygon).toEqual([
      [20, 20],
      [40, 20],
      [40, 40],
      [20, 40],
    ]);
    expect(hold.bbox).toEqual([20, 20, 20, 20]);
    expect(hold.areaPx).toBe(400);
    expect(hold.source).toBe('auto');
    expect(hold.meanColorLab).toEqual([1, 2, 3]);
  });

  it('produces stable, deduped ids from centroids', () => {
    const raw: DetectRawHold[] = [
      { polygon: [], centroid: [100, 100], bbox: [0, 0, 1, 1], areaPx: 1, meanColorLab: [0, 0, 0] },
      { polygon: [], centroid: [500, 500], bbox: [0, 0, 1, 1], areaPx: 1, meanColorLab: [0, 0, 0] },
    ];
    const holds = rawHoldsToHolds(raw, 1);
    expect(new Set(holds.map((h) => h.id)).size).toBe(2);
  });
});
