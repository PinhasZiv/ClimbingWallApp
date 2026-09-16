import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import PhotoStage from '../components/PhotoStage';
import HoldShape from '../components/HoldShape';
import { useWall, updateWall } from '../hooks/useWalls';
import { getBlob } from '../db/blobs';
import {
  makeCirclePolygon,
  pointInPolygon,
  polygonArea,
  polygonBBox,
  type Point,
} from '../lib/geometry';
import { rgbToOpenCvLab8u } from '../lib/color';
import { createPixelSampler } from '../lib/pixelSampler';
import { decodeForDetection, type DetectionImage } from '../lib/decodeForDetection';
import { DETECTION_MAX_EDGE } from '../lib/constants';
import { detectionClient } from '../detection/client';
import { rawHoldsToHolds } from '../detection/toHolds';
import { mergeAutoHolds } from '../detection/mergeResults';
import {
  bgDeltaEToSensitivity,
  minAreaFracToSlider,
  sensitivityToBgDeltaE,
  sliderToMinAreaFrac,
} from '../detection/sliderMapping';
import type { DetectionParams, Hold } from '../types/models';

/** Manual "Add" fallback when there's no candidate mask to snap to (real snap-to-mask is M5). */
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

function averageLab(samples: [number, number, number][]): [number, number, number] {
  const sum = samples.reduce<[number, number, number]>(
    (acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]],
    [0, 0, 0],
  );
  return [sum[0] / samples.length, sum[1] / samples.length, sum[2] / samples.length];
}

export default function DetectionTuning() {
  const { wallId } = useParams();
  const navigate = useNavigate();
  const { wall, loading } = useWall(wallId);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [params, setParams] = useState<DetectionParams | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [pickingColor, setPickingColor] = useState(false);
  const [colorSamples, setColorSamples] = useState<[number, number, number][]>([]);

  const detectionImageRef = useRef<DetectionImage | null>(null);
  const pixelSamplerRef = useRef<((x: number, y: number) => [number, number, number]) | null>(null);
  const hasAutoRun = useRef(false);
  const [detectionImageReady, setDetectionImageReady] = useState(false);

  useEffect(() => {
    if (!wall) return;
    setParams((p) => p ?? wall.detectionParams);
  }, [wall]);

  useEffect(() => {
    if (!wall) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    getBlob(wall.photoBlobKey)
      .then(async (blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
        const [detectionImage, sampler] = await Promise.all([
          decodeForDetection(blob, DETECTION_MAX_EDGE),
          createPixelSampler(blob),
        ]);
        if (cancelled) return;
        detectionImageRef.current = detectionImage;
        pixelSamplerRef.current = sampler;
        setDetectionImageReady(true);
      })
      .catch((err) => {
        if (!cancelled) setDetectError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall?.photoBlobKey]);

  // Auto-run only once, and only once both the params and the decoded detection image are
  // actually ready — waiting on a ref/flag here (rather than firing straight from the async
  // callback above) avoids a stale closure over a still-null `params` from an earlier render.
  useEffect(() => {
    if (!wall || !params || !detectionImageReady || hasAutoRun.current) return;
    if (wall.holds.length > 0) return;
    hasAutoRun.current = true;
    void runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall, params, detectionImageReady]);

  async function runDetection() {
    if (!wall || !params || !detectionImageRef.current) return;
    setIsDetecting(true);
    setDetectError(null);
    setProgressStage('starting');
    try {
      const wallLabOverride = colorSamples.length > 0 ? averageLab(colorSamples) : null;
      const { holds: rawHolds } = await detectionClient.detect(
        detectionImageRef.current.imageData,
        params,
        wallLabOverride,
        setProgressStage,
      );
      const freshAutoHolds = rawHoldsToHolds(rawHolds, detectionImageRef.current.scaleFactor);
      const merged = mergeAutoHolds(wall.holds, wall.deletedAutoIds, freshAutoHolds);
      await updateWall(wall.id, {
        holds: merged.holds,
        deletedAutoIds: merged.deletedAutoIds,
        detectionParams: params,
      });
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDetecting(false);
      setProgressStage(null);
    }
  }

  if (loading || !params) return <div className="p-4 text-neutral-400">Loading…</div>;
  if (!wall) return <div className="p-4 text-neutral-400">Wall not found.</div>;

  function handleTap(point: Point) {
    if (!wall) return;
    if (pickingColor) {
      if (colorSamples.length >= 3 || !pixelSamplerRef.current) return;
      const [r, g, b] = pixelSamplerRef.current(point[0], point[1]);
      setColorSamples((s) => [...s, rgbToOpenCvLab8u(r, g, b)]);
      return;
    }
    const hit = wall.holds.find((h) => pointInPolygon(point, h.polygon));
    if (hit) {
      const nextDeletedAutoIds =
        hit.source === 'auto' ? [...wall.deletedAutoIds, hit.id] : wall.deletedAutoIds;
      updateWall(wall.id, {
        holds: wall.holds.filter((h) => h.id !== hit.id),
        deletedAutoIds: nextDeletedAutoIds,
      });
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
        <span className="text-sm text-neutral-400">
          {isDetecting ? `Detecting… ${progressStage ?? ''}` : `Detected ${wall.holds.length} holds`}
        </span>
      </header>

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

      {pickingColor && (
        <div className="mx-4 mb-2 flex items-center justify-between rounded-lg bg-blue-900/40 px-3 py-2 text-sm text-blue-100">
          <span>Tap 1–3 spots of bare wall ({colorSamples.length}/3 picked)</span>
          <div className="flex gap-2">
            <button className="underline" onClick={() => setColorSamples([])}>
              Clear
            </button>
            <button className="font-medium" onClick={() => setPickingColor(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {detectError && (
        <div className="mx-4 mb-2 rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200">
          Detection failed: {detectError}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-neutral-800 p-4">
        <label className="flex flex-col gap-1 text-sm text-neutral-300">
          <span className="flex justify-between">
            <span>Sensitivity</span>
            <span className="text-neutral-500">{bgDeltaEToSensitivity(params.bgDeltaE)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={bgDeltaEToSensitivity(params.bgDeltaE)}
            onChange={(e) =>
              setParams((p) => p && { ...p, bgDeltaE: sensitivityToBgDeltaE(Number(e.target.value)) })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-300">
          <span className="flex justify-between">
            <span>Minimum hold size</span>
            <span className="text-neutral-500">{minAreaFracToSlider(params.minAreaFrac)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={minAreaFracToSlider(params.minAreaFrac)}
            onChange={(e) =>
              setParams(
                (p) => p && { ...p, minAreaFrac: sliderToMinAreaFrac(Number(e.target.value)) },
              )
            }
          />
        </label>

        <label className="flex items-center justify-between text-sm text-neutral-300">
          <span>Split touching holds</span>
          <input
            type="checkbox"
            checked={params.splitTouching}
            onChange={(e) => setParams((p) => p && { ...p, splitTouching: e.target.checked })}
          />
        </label>

        <div className="flex gap-3">
          <button
            className="flex-1 rounded-full bg-neutral-800 px-4 py-3 text-sm font-medium disabled:opacity-50"
            disabled={isDetecting}
            onClick={() => setPickingColor((v) => !v)}
          >
            {pickingColor ? 'Picking wall colour…' : 'Pick wall colour'}
          </button>
          <button
            className="flex-1 rounded-full bg-neutral-800 px-4 py-3 text-sm font-medium disabled:opacity-50"
            disabled={isDetecting}
            onClick={() => void runDetection()}
          >
            Re-run
          </button>
        </div>

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
