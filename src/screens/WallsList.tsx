import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useWalls } from '../hooks/useWalls';
import { useRoutesForWall } from '../hooks/useRoutes';
import { getBlob } from '../db/blobs';
import type { Wall } from '../types/models';

function WallThumb({ wall }: { wall: Wall }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    getBlob(wall.photoBlobKey).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wall.photoBlobKey]);

  if (!url) {
    return <div className="aspect-video w-full rounded-lg bg-neutral-800" />;
  }
  return (
    <img
      src={url}
      alt={wall.name}
      className="aspect-video w-full rounded-lg object-cover"
    />
  );
}

function RouteCount({ wallId }: { wallId: string }) {
  const { routes } = useRoutesForWall(wallId);
  return (
    <div className="text-xs text-neutral-400">
      {routes?.length ?? 0} route{routes?.length === 1 ? '' : 's'}
    </div>
  );
}

export default function WallsList() {
  const { walls, loading } = useWalls();

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Walls</h1>
        <div className="flex items-center gap-2">
          <Link to="/settings" className="rounded-full bg-neutral-800 px-3 py-2 text-sm">
            Settings
          </Link>
          <Link
            to="/capture"
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white active:bg-blue-700"
          >
            + New wall
          </Link>
        </div>
      </header>

      {loading && <p className="text-neutral-400">Loading…</p>}

      {!loading && walls && walls.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-neutral-400">
          <p>No walls yet.</p>
          <p className="text-sm">
            Photograph a climbing wall to detect holds and start setting routes.
          </p>
          <Link
            to="/capture"
            className="mt-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            Add your first wall
          </Link>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {walls?.map((wall) => (
          <li key={wall.id}>
            <Link to={`/walls/${wall.id}`} className="block space-y-1.5">
              <WallThumb wall={wall} />
              <div className="truncate text-sm font-medium">{wall.name}</div>
              <RouteCount wallId={wall.id} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
