import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createWall, useWalls } from '../hooks/useWalls';
import { storeBlob } from '../db/blobs';
import { normalizeAndDownscale } from '../lib/image';
import { CANONICAL_MAX_EDGE } from '../lib/constants';
import { dismissCaptureHint, isCaptureHintDismissed } from '../lib/prefs';
import { capturePhoto, pickPhotoFromGallery } from '../platform/capture';

type Stage =
  | { kind: 'hint' }
  | { kind: 'pick' }
  | { kind: 'name'; blob: Blob; previewUrl: string }
  | { kind: 'processing' }
  | { kind: 'error'; message: string };

export default function CaptureImport() {
  const navigate = useNavigate();
  const { walls } = useWalls();
  const [stage, setStage] = useState<Stage>({
    kind: isCaptureHintDismissed() ? 'pick' : 'hint',
  });
  const [name, setName] = useState('');

  useEffect(() => {
    return () => {
      if (stage.kind === 'name') URL.revokeObjectURL(stage.previewUrl);
    };
  }, [stage]);

  async function handlePicked(photo: { blob: Blob } | null) {
    if (!photo) return;
    setName(`Wall ${(walls?.length ?? 0) + 1}`);
    setStage({ kind: 'name', blob: photo.blob, previewUrl: URL.createObjectURL(photo.blob) });
  }

  async function handleSave() {
    if (stage.kind !== 'name') return;
    const { blob } = stage;
    setStage({ kind: 'processing' });
    try {
      const normalized = await normalizeAndDownscale(blob, CANONICAL_MAX_EDGE);
      const photoBlobKey = await storeBlob(normalized.blob);
      const wall = await createWall({
        name: name.trim() || 'Untitled wall',
        photoBlobKey,
        photoWidth: normalized.width,
        photoHeight: normalized.height,
      });
      navigate(`/walls/${wall.id}`, { replace: true });
    } catch (err) {
      setStage({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">New wall</h1>
      </header>

      {stage.kind === 'hint' && (
        <div className="flex flex-1 flex-col justify-between gap-6">
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Before you shoot</h2>
            <ul className="list-disc space-y-2 pl-5 text-neutral-300">
              <li>Stand back far enough to get the whole panel in frame</li>
              <li>Shoot straight on, not from an angle</li>
              <li>Even light, no harsh shadow across the wall, no people on the wall</li>
            </ul>
          </div>
          <button
            className="rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white"
            onClick={() => {
              dismissCaptureHint();
              setStage({ kind: 'pick' });
            }}
          >
            Got it
          </button>
        </div>
      )}

      {stage.kind === 'pick' && (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <button
            className="rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white"
            onClick={() => capturePhoto().then(handlePicked)}
          >
            Take photo
          </button>
          <button
            className="rounded-full bg-neutral-800 px-4 py-3 text-sm font-medium"
            onClick={() => pickPhotoFromGallery().then(handlePicked)}
          >
            Choose from gallery
          </button>
        </div>
      )}

      {stage.kind === 'name' && (
        <div className="flex flex-1 flex-col gap-4">
          <img
            src={stage.previewUrl}
            alt="Selected wall"
            className="max-h-80 w-full rounded-lg object-contain"
          />
          <label className="flex flex-col gap-1.5 text-sm text-neutral-300">
            Wall name
            <input
              className="rounded-lg bg-neutral-800 px-3 py-2 text-base text-neutral-50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <div className="mt-auto flex gap-3">
            <button
              className="flex-1 rounded-full bg-neutral-800 px-4 py-3 text-sm font-medium"
              onClick={() => setStage({ kind: 'pick' })}
            >
              Retake
            </button>
            <button
              className="flex-1 rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white"
              onClick={handleSave}
            >
              Save wall
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'processing' && (
        <div className="flex flex-1 items-center justify-center text-neutral-400">
          Processing photo…
        </div>
      )}

      {stage.kind === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-red-400">{stage.message}</p>
          <button
            className="rounded-full bg-neutral-800 px-4 py-2 text-sm"
            onClick={() => setStage({ kind: 'pick' })}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
