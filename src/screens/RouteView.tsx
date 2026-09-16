import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PhotoStage from '../components/PhotoStage';
import HoldShape from '../components/HoldShape';
import { useWall } from '../hooks/useWalls';
import { useRoute } from '../hooks/useRoutes';
import { getBlob } from '../db/blobs';
import { acquireWakeLock, type WakeLockHandle } from '../platform/wakeLock';

export default function RouteView() {
  const { routeId } = useParams();
  const { route, loading: routeLoading } = useRoute(routeId);
  const { wall, loading: wallLoading } = useWall(route?.wallId);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!wall) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    getBlob(wall.photoBlobKey).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setPhotoUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wall?.photoBlobKey]);

  // Standing under a wall glancing at a route is exactly when a phone would otherwise sleep.
  // The Wake Lock API auto-releases on tab/screen hide, so re-acquire when this screen
  // becomes visible again for as long as it's mounted.
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  useEffect(() => {
    async function acquire() {
      wakeLockRef.current = await acquireWakeLock();
    }
    void acquire();
    function handleVisibility() {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) void acquire();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  if (routeLoading || wallLoading) return <div className="p-4 text-neutral-400">Loading…</div>;
  if (!route) return <div className="p-4 text-neutral-400">Route not found.</div>;
  if (!wall) return <div className="p-4 text-neutral-400">Wall not found.</div>;

  const validHoldIds = new Set(wall.holds.map((h) => h.id));
  const missingCount = Object.keys(route.assignments).filter((id) => !validHoldIds.has(id)).length;
  const highlightedHolds = wall.holds.filter((h) => (route.assignments[h.id] ?? 'unused') !== 'unused');

  return (
    <div className="flex h-dvh flex-col bg-black">
      <header className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/walls/${wall.id}/routes/${route.id}`} className="shrink-0 text-neutral-400">
            ← Back
          </Link>
          <h1 className="truncate text-lg font-semibold">{route.name}</h1>
        </div>
        {route.grade && <span className="shrink-0 text-sm text-neutral-400">{route.grade}</span>}
      </header>

      {missingCount > 0 && (
        <div className="mx-4 mb-2 rounded-lg bg-yellow-900/40 px-3 py-2 text-sm text-yellow-200">
          {missingCount} hold{missingCount === 1 ? '' : 's'} from this route no longer{' '}
          {missingCount === 1 ? 'exists' : 'exist'} on the wall.
        </div>
      )}

      <div className="min-h-0 flex-1">
        {photoUrl && (
          <PhotoStage photoUrl={photoUrl} imageWidth={wall.photoWidth} imageHeight={wall.photoHeight}>
            {({ totalScale }) => (
              <>
                <rect
                  x={0}
                  y={0}
                  width={wall.photoWidth}
                  height={wall.photoHeight}
                  fill="black"
                  fillOpacity={0.55}
                />
                {highlightedHolds.map((hold) => (
                  <HoldShape
                    key={hold.id}
                    hold={hold}
                    role={route.assignments[hold.id] ?? 'unused'}
                    totalScale={totalScale}
                  />
                ))}
              </>
            )}
          </PhotoStage>
        )}
      </div>

      {(route.notes || route.footRule !== 'marked-only') && (
        <div className="flex flex-col gap-1 border-t border-neutral-800 p-4 text-sm text-neutral-300">
          {route.footRule !== 'marked-only' && (
            <p>{route.footRule === 'any-hold' ? 'Feet: any hold on the wall' : 'Feet: follow hands'}</p>
          )}
          {route.notes && <p className="text-neutral-400">{route.notes}</p>}
        </div>
      )}
    </div>
  );
}
