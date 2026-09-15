import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import PhotoStage from '../components/PhotoStage';
import HoldShape from '../components/HoldShape';
import { useWall, updateWall } from '../hooks/useWalls';
import { getBlob } from '../db/blobs';
import { makeCirclePolygon, pointInPolygon, polygonArea, polygonBBox, type Point } from '../lib/geometry';
import type { Hold } from '../types/models';

/** No detector yet (M4): fixed-radius circle, ~3.5% of the photo's longest edge. */
function manualHoldRadius(imageWidth: number, imageHeight: number): number {
  return Math.max(imageWidth, imageHeight) * 0.035;
}

function createManualHold(center: Point, radius: number): Hold {
  const polygon = makeCirclePolygon(center, radius);
  return {
    id: uuid(),
    polygon,
    centroid: center,
    bbox: polygonBBox(polygon),
    areaPx: polygonArea(polygon),
    meanColorLab: [0, 0, 0],
    source: 'manual',
  };
}

export default function DetectionTuning() {
  const { wallId } = useParams();
  const navigate = useNavigate();
  const { wall, loading } = useWall(wallId);
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

  if (loading) return <div className="p-4 text-neutral-400">Loading…</div>;
  if (!wall) return <div className="p-4 text-neutral-400">Wall not found.</div>;

  function handleTap(point: Point) {
    if (!wall) return;
    const hit = wall.holds.find((h) => pointInPolygon(point, h.polygon));
    if (hit) {
      updateWall(wall.id, { holds: wall.holds.filter((h) => h.id !== hit.id) });
    } else {
      const radius = manualHoldRadius(wall.photoWidth, wall.photoHeight);
      updateWall(wall.id, { holds: [...wall.holds, createManualHold(point, radius)] });
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Link to={`/walls/${wall.id}`} className="text-neutral-400">
            ← Back
          </Link>
          <h1 className="text-lg font-semibold">Hold map</h1>
        </div>
        <span className="text-sm text-neutral-400">{wall.holds.length} holds</span>
      </header>

      <p className="px-4 pb-2 text-sm text-neutral-400">
        Automatic detection arrives in M4. For now: tap the bare wall to add a hold, tap a hold to
        remove it.
      </p>

      <div className="min-h-0 flex-1">
        {photoUrl && (
          <PhotoStage
            photoUrl={photoUrl}
            imageWidth={wall.photoWidth}
            imageHeight={wall.photoHeight}
            onTap={handleTap}
          >
            {({ totalScale }) =>
              wall.holds.map((hold) => (
                <HoldShape
                  key={hold.id}
                  hold={hold}
                  role="unused"
                  totalScale={totalScale}
                  showNeutralOutline
                />
              ))
            }
          </PhotoStage>
        )}
      </div>

      <div className="p-4">
        <button
          className="w-full rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white"
          onClick={() => navigate(`/walls/${wall.id}`)}
        >
          Save wall
        </button>
      </div>
    </div>
  );
}
