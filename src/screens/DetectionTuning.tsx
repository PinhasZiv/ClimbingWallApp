import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import PhotoStage from '../components/PhotoStage';
import HoldShape from '../components/HoldShape';
import { useWall, updateWall } from '../hooks/useWalls';
import { getBlob } from '../db/blobs';
import {
  convexHull,
  makeCirclePolygon,
  pointInPolygon,
  polygonArea,
  polygonBBox,
  polygonCentroid,
  splitPolygonByLine,
  type Point,
} from '../lib/geometry';
import { rgbToOpenCvLab8u } from '../lib/color';
import { floodFillHold } from '../lib/floodFill';
import { createPixelSampler } from '../lib/pixelSampler';
import { decodeForDetection, type DetectionImage } from '../lib/decodeForDetection';
import { DETECTION_MAX_EDGE } from '../lib/constants';
import { detectionClient } from '../detection/client';
import { rawHoldsToHolds } from '../detection/toHolds';
import { mergeAutoHolds } from '../detection/mergeResults';
import { UndoStack } from '../detection/undoStack';
import {
  bgDeltaEToSensitivity,
  minAreaFracToSlider,
  sensitivityToBgDeltaE,
  sliderToMinAreaFrac,
} from '../detection/sliderMapping';
import type { DetectionParams, Hold } from '../types/models';

type ToolMode = 'add' | 'delete' | 'merge' | 'split';

const TOOL_LABELS: { mode: ToolMode; label: string }[] = [
  { mode: 'add', label: 'Add' },
  { mode: 'delete', label: 'Delete' },
  { mode: 'merge', label: 'Merge' },
  { mode: 'split', label: 'Split' },
];

/** Fallback when flood-fill finds nothing sensible to snap to (bare wall, or it "runs away"). */
function manualHoldRadius(imageWidth: number, imageHeight: number): number {
  return Math.max(imageWidth, imageHeight) * 0.035;
}

function makeHold(polygon: Point[], source: Hold['source'], meanColorLab: [number, number, number] = [0, 0, 0]): Hold {
  return {
    id: uuid(),
    polygon,
    centroid: polygonCentroid(polygon),
    bbox: polygonBBox(polygon),
    areaPx: polygonArea(polygon),
    meanColorLab,
    source,
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

  const [toolMode, setToolMode] = useState<ToolMode>('add');
  const [mergeFirstId, setMergeFirstId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<Point[] | null>(null);
  const [, forceUndoRedoRerender] = useState(0);

  const detectionImageRef = useRef<DetectionImage | null>(null);
  const pixelSamplerRef = useRef<((x: number, y: number) => [number, number, number]) | null>(null);
  const lastWallLabRef = useRef<[number, number, number] | null>(null);
  const undoStackRef = useRef(new UndoStack(20));
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

  async function applyHoldsUpdate(newHolds: Hold[], newDeletedAutoIds: string[]) {
    if (!wall) return;
    undoStackRef.current.record({ holds: wall.holds, deletedAutoIds: wall.deletedAutoIds });
    forceUndoRedoRerender((n) => n + 1);
    await updateWall(wall.id, { holds: newHolds, deletedAutoIds: newDeletedAutoIds });
  }

  async function handleUndo() {
    if (!wall) return;
    const restored = undoStackRef.current.undo({ holds: wall.holds, deletedAutoIds: wall.deletedAutoIds });
    forceUndoRedoRerender((n) => n + 1);
    if (restored) await updateWall(wall.id, restored);
  }

  async function handleRedo() {
    if (!wall) return;
    const restored = undoStackRef.current.redo({ holds: wall.holds, deletedAutoIds: wall.deletedAutoIds });
    forceUndoRedoRerender((n) => n + 1);
    if (restored) await updateWall(wall.id, restored);
  }

  async function runDetection() {
    if (!wall || !params || !detectionImageRef.current) return;
    setIsDetecting(true);
    setDetectError(null);
    setProgressStage('starting');
    try {
      const wallLabOverride = colorSamples.length > 0 ? averageLab(colorSamples) : null;
      const { holds: rawHolds, wallLabUsed } = await detectionClient.detect(
        detectionImageRef.current.imageData,
        params,
        wallLabOverride,
        setProgressStage,
      );
      lastWallLabRef.current = wallLabUsed;
      const freshAutoHolds = rawHoldsToHolds(rawHolds, detectionImageRef.current.scaleFactor);
      const merged = mergeAutoHolds(wall.holds, wall.deletedAutoIds, freshAutoHolds);
      undoStackRef.current.record({ holds: wall.holds, deletedAutoIds: wall.deletedAutoIds });
      forceUndoRedoRerender((n) => n + 1);
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

  // Narrowed local aliases: TS doesn't propagate the null-checks above into the nested
  // function declarations below, since they're closures that could in principle run later.
  const currentParams = params;

  function handleTap(point: Point) {
    if (!wall) return;
    if (pickingColor) {
      if (colorSamples.length >= 3 || !pixelSamplerRef.current) return;
      const [r, g, b] = pixelSamplerRef.current(point[0], point[1]);
      setColorSamples((s) => [...s, rgbToOpenCvLab8u(r, g, b)]);
      return;
    }

    const hit = wall.holds.find((h) => pointInPolygon(point, h.polygon));

    if (toolMode === 'add') {
      if (hit) return;
      const wallLab = lastWallLabRef.current;
      const maxPixels = Math.round(wall.photoWidth * wall.photoHeight * 0.02);
      const polygon =
        wallLab && pixelSamplerRef.current
          ? floodFillHold(
              point,
              pixelSamplerRef.current,
              wallLab,
              currentParams.bgDeltaE,
              wall.photoWidth,
              wall.photoHeight,
              maxPixels,
            )
          : null;
      const newHold = polygon
        ? makeHold(polygon, 'manual')
        : makeHold(makeCirclePolygon(point, manualHoldRadius(wall.photoWidth, wall.photoHeight)), 'manual');
      void applyHoldsUpdate([...wall.holds, newHold], wall.deletedAutoIds);
      return;
    }

    if (toolMode === 'delete') {
      if (!hit) return;
      const nextDeletedAutoIds =
        hit.source === 'auto' ? [...wall.deletedAutoIds, hit.id] : wall.deletedAutoIds;
      void applyHoldsUpdate(
        wall.holds.filter((h) => h.id !== hit.id),
        nextDeletedAutoIds,
      );
      return;
    }

    if (toolMode === 'merge') {
      if (!hit) return;
      if (!mergeFirstId) {
        setMergeFirstId(hit.id);
        return;
      }
      if (hit.id === mergeFirstId) {
        setMergeFirstId(null);
        return;
      }
      const first = wall.holds.find((h) => h.id === mergeFirstId);
      setMergeFirstId(null);
      if (!first) return;
      const mergedHold = makeHold(convexHull([...first.polygon, ...hit.polygon]), 'manual');
      const consumedAutoIds = [first, hit].filter((h) => h.source === 'auto').map((h) => h.id);
      const remaining = wall.holds.filter((h) => h.id !== first.id && h.id !== hit.id);
      void applyHoldsUpdate([...remaining, mergedHold], [...wall.deletedAutoIds, ...consumedAutoIds]);
    }
  }

  function handleDragEnd(points: Point[]) {
    setDragPreview(null);
    if (!wall || points.length < 2) return;

    if (toolMode === 'delete') {
      const hitIds = new Set<string>();
      for (const p of points) {
        for (const h of wall.holds) {
          if (pointInPolygon(p, h.polygon)) hitIds.add(h.id);
        }
      }
      if (hitIds.size === 0) return;
      const nextDeletedAutoIds = [
        ...wall.deletedAutoIds,
        ...wall.holds.filter((h) => hitIds.has(h.id) && h.source === 'auto').map((h) => h.id),
      ];
      void applyHoldsUpdate(
        wall.holds.filter((h) => !hitIds.has(h.id)),
        nextDeletedAutoIds,
      );
      return;
    }

    if (toolMode === 'split') {
      const lineA = points[0];
      const lineB = points[points.length - 1];
      const dragMinX = Math.min(...points.map((p) => p[0]));
      const dragMaxX = Math.max(...points.map((p) => p[0]));
      const dragMinY = Math.min(...points.map((p) => p[1]));
      const dragMaxY = Math.max(...points.map((p) => p[1]));

      for (const hold of wall.holds) {
        const [bx, by, bw, bh] = hold.bbox;
        const overlaps = bx <= dragMaxX && bx + bw >= dragMinX && by <= dragMaxY && by + bh >= dragMinY;
        if (!overlaps) continue;
        const result = splitPolygonByLine(hold.polygon, lineA, lineB);
        if (!result) continue;
        const [polyA, polyB] = result;
        const nextDeletedAutoIds =
          hold.source === 'auto' ? [...wall.deletedAutoIds, hold.id] : wall.deletedAutoIds;
        void applyHoldsUpdate(
          [
            ...wall.holds.filter((h) => h.id !== hold.id),
            makeHold(polyA, 'manual', hold.meanColorLab),
            makeHold(polyB, 'manual', hold.meanColorLab),
          ],
          nextDeletedAutoIds,
        );
        return;
      }
    }
  }

  const dragMode = toolMode === 'delete' || toolMode === 'split';

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
            dragMode={dragMode}
            onDragMove={dragMode ? setDragPreview : undefined}
            onDragEnd={dragMode ? handleDragEnd : undefined}
          >
            {({ totalScale }) => (
              <>
                {wall.holds.map((hold) => (
                  <HoldShape
                    key={hold.id}
                    hold={hold}
                    role="unused"
                    totalScale={totalScale}
                    showNeutralOutline
                    selected={hold.id === mergeFirstId}
                  />
                ))}
                {dragPreview && dragPreview.length > 1 && (
                  <polyline
                    points={dragPreview.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke={toolMode === 'delete' ? '#ef4444' : '#ffffff'}
                    strokeWidth={3 / totalScale}
                    strokeLinecap="round"
                  />
                )}
              </>
            )}
          </PhotoStage>
        )}
      </div>

      {toolMode === 'merge' && mergeFirstId && (
        <div className="mx-4 mb-2 rounded-lg bg-blue-900/40 px-3 py-2 text-sm text-blue-100">
          Tap a second hold to merge with the highlighted one.
        </div>
      )}

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

      <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto border-t border-neutral-800 p-4">
        <div className="grid grid-cols-4 gap-2">
          {TOOL_LABELS.map(({ mode, label }) => (
            <button
              key={mode}
              className={`rounded-lg px-2 py-2 text-sm font-medium ${
                toolMode === mode ? 'bg-blue-600 text-white' : 'bg-neutral-800'
              }`}
              onClick={() => {
                setToolMode(mode);
                setMergeFirstId(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            className="flex-1 rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium disabled:opacity-40"
            disabled={!undoStackRef.current.canUndo()}
            onClick={() => void handleUndo()}
          >
            Undo
          </button>
          <button
            className="flex-1 rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium disabled:opacity-40"
            disabled={!undoStackRef.current.canRedo()}
            onClick={() => void handleRedo()}
          >
            Redo
          </button>
        </div>

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
