import { useEffect, useState } from 'react';
import { db } from '../db/db';

export interface WallStorageEntry {
  wallId: string;
  wallName: string;
  bytes: number;
}

export interface StorageBreakdown {
  totalBytes: number;
  perWall: WallStorageEntry[];
}

/**
 * Per-wall storage size, dominated by the stored photo blob (the dominant cost the spec calls
 * out — hold polygons and route data are comparatively tiny). Recomputed on demand rather than
 * as a live query, since it touches every blob and isn't something that needs to track every
 * write in real time.
 */
export function useStorageBreakdown(refreshKey: number) {
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const walls = await db.walls.toArray();
      const perWall = await Promise.all(
        walls.map(async (wall): Promise<WallStorageEntry> => {
          const record = await db.blobs.get(wall.photoBlobKey);
          return { wallId: wall.id, wallName: wall.name, bytes: record?.blob.size ?? 0 };
        }),
      );
      if (cancelled) return;
      setBreakdown({ totalBytes: perWall.reduce((sum, w) => sum + w.bytes, 0), perWall });
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return breakdown;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
