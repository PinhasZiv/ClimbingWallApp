import type { Hold } from '../types/models';

/**
 * Deterministic id for an auto-detected hold, from its centroid snapped to a coarse grid.
 * This is what "stable IDs across re-runs" (§6.8) means in practice: re-running detection
 * with the same/similar params reproduces the same centroid, so the same hold gets the same
 * id, and a manual deletion recorded against that id still applies. Small param changes that
 * shift a hold's centroid past the grid snap will "forget" that it was deleted — an accepted
 * tradeoff of not having real object tracking between runs.
 */
export function autoHoldId(centroid: [number, number], gridPx = 6): string {
  const gx = Math.round(centroid[0] / gridPx) * gridPx;
  const gy = Math.round(centroid[1] / gridPx) * gridPx;
  return `auto-${gx}-${gy}`;
}

/** Disambiguate colliding ids within a single detection run (dense walls can snap two holds to one cell). */
export function dedupeIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    return count === 0 ? item : { ...item, id: `${item.id}-${count + 1}` };
  });
}

export interface MergeResult {
  holds: Hold[];
  deletedAutoIds: string[];
}

/**
 * Combine a fresh detection pass with what's already on the wall: keep every manual hold
 * untouched, drop any fresh auto hold whose id was previously deleted, and prune
 * deletedAutoIds down to ids that still recur (so it doesn't grow forever across re-runs).
 */
export function mergeAutoHolds(
  existingHolds: Hold[],
  deletedAutoIds: string[],
  freshAutoHolds: Hold[],
): MergeResult {
  const manualHolds = existingHolds.filter((h) => h.source === 'manual');
  const deletedSet = new Set(deletedAutoIds);
  const keptAuto = freshAutoHolds.filter((h) => !deletedSet.has(h.id));

  const freshIds = new Set(freshAutoHolds.map((h) => h.id));
  const prunedDeleted = deletedAutoIds.filter((id) => freshIds.has(id));

  return { holds: [...keptAuto, ...manualHolds], deletedAutoIds: prunedDeleted };
}
