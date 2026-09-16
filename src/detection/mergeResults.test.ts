import { describe, expect, it } from 'vitest';
import { autoHoldId, dedupeIds, mergeAutoHolds } from './mergeResults';
import type { Hold } from '../types/models';

function makeHold(id: string, source: 'auto' | 'manual' = 'auto'): Hold {
  return {
    id,
    polygon: [[0, 0], [1, 0], [1, 1], [0, 1]],
    centroid: [0.5, 0.5],
    bbox: [0, 0, 1, 1],
    areaPx: 1,
    meanColorLab: [0, 0, 0],
    source,
  };
}

describe('autoHoldId', () => {
  it('is stable for the same centroid', () => {
    expect(autoHoldId([100, 200])).toBe(autoHoldId([100, 200]));
  });
  it('is stable across small jitter within one grid cell', () => {
    expect(autoHoldId([100, 200])).toBe(autoHoldId([101, 199]));
  });
  it('differs for centroids far apart', () => {
    expect(autoHoldId([100, 200])).not.toBe(autoHoldId([300, 500]));
  });
});

describe('dedupeIds', () => {
  it('leaves unique ids untouched', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(dedupeIds(items)).toEqual(items);
  });
  it('suffixes colliding ids to keep them unique', () => {
    const items = [{ id: 'a' }, { id: 'a' }, { id: 'a' }];
    const result = dedupeIds(items);
    expect(result.map((i) => i.id)).toEqual(['a', 'a-2', 'a-3']);
  });
});

describe('mergeAutoHolds', () => {
  it('keeps manual holds untouched and includes all fresh auto holds when nothing was deleted', () => {
    const manual = makeHold('m1', 'manual');
    const existing = [manual, makeHold('auto-old')];
    const fresh = [makeHold('auto-1'), makeHold('auto-2')];
    const result = mergeAutoHolds(existing, [], fresh);
    expect(result.holds).toEqual(expect.arrayContaining([manual, ...fresh]));
    expect(result.holds).toHaveLength(3);
  });

  it('drops a fresh auto hold whose id was previously deleted', () => {
    const fresh = [makeHold('auto-1'), makeHold('auto-2')];
    const result = mergeAutoHolds([], ['auto-1'], fresh);
    expect(result.holds.map((h) => h.id)).toEqual(['auto-2']);
  });

  it('prunes deletedAutoIds down to ids that still recur in the fresh detection', () => {
    const fresh = [makeHold('auto-1')];
    // 'auto-stale' was deleted once but no longer appears at all after a param change
    const result = mergeAutoHolds([], ['auto-1', 'auto-stale'], fresh);
    expect(result.deletedAutoIds).toEqual(['auto-1']);
    expect(result.holds).toEqual([]);
  });

  it('never lets a deletion remove a manual hold, even with a colliding id', () => {
    const manual = makeHold('auto-1', 'manual');
    const result = mergeAutoHolds([manual], ['auto-1'], [makeHold('auto-1')]);
    expect(result.holds).toEqual([manual]);
  });
});
