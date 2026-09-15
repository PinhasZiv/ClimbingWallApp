import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PhotoStage from '../components/PhotoStage';
import HoldShape from '../components/HoldShape';
import { useWall } from '../hooks/useWalls';
import { createRoute, FOOT_RULES, setHoldRole, updateRoute, useRoute, useRoutesForWall } from '../hooks/useRoutes';
import { getBlob } from '../db/blobs';
import { pointInPolygon, type Point } from '../lib/geometry';
import { nextRole } from '../lib/roleCycle';
import { FONT_GRADES, V_GRADES } from '../lib/constants';
import { getRememberedGradeSystem, rememberGradeSystem } from '../lib/prefs';
import type { FootRule, GradeSystem, HoldRole } from '../types/models';

const ROLE_LABELS: { role: HoldRole; label: string }[] = [
  { role: 'unused', label: 'Unused' },
  { role: 'start', label: 'Start' },
  { role: 'hand', label: 'Hand' },
  { role: 'foot', label: 'Foot' },
  { role: 'finish', label: 'Finish' },
];

interface Meta {
  name: string;
  grade: string | null;
  gradeSystem: GradeSystem;
  footRule: FootRule;
  notes: string;
}

export default function RouteEditor() {
  const { wallId, routeId } = useParams();
  const navigate = useNavigate();
  const isNew = routeId === 'new';

  const { wall, loading: wallLoading } = useWall(wallId);
  const { route } = useRoute(isNew ? undefined : routeId);
  const { routes: wallRoutes } = useRoutesForWall(wallId);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, HoldRole>>({});
  const [meta, setMeta] = useState<Meta>({
    name: '',
    grade: null,
    gradeSystem: getRememberedGradeSystem(),
    footRule: 'marked-only',
    notes: '',
  });
  const [longPressHoldId, setLongPressHoldId] = useState<string | null>(null);
  const [showMetaSheet, setShowMetaSheet] = useState(false);

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

  useEffect(() => {
    if (initialized) return;
    if (isNew) {
      if (wallRoutes === undefined) return;
      setMeta((m) => ({ ...m, name: `Route ${wallRoutes.length + 1}` }));
      setInitialized(true);
    } else if (route) {
      setAssignments(route.assignments);
      setMeta({
        name: route.name,
        grade: route.grade,
        gradeSystem: route.gradeSystem,
        footRule: route.footRule,
        notes: route.notes,
      });
      setInitialized(true);
    }
  }, [isNew, route, wallRoutes, initialized]);

  if (wallLoading || !initialized) return <div className="p-4 text-neutral-400">Loading…</div>;
  if (!wall) return <div className="p-4 text-neutral-400">Wall not found.</div>;

  function hitTest(point: Point) {
    return wall!.holds.find((h) => pointInPolygon(point, h.polygon)) ?? null;
  }

  function handleTap(point: Point) {
    const hit = hitTest(point);
    if (!hit) return;
    setAssignments((a) => setHoldRole(a, hit.id, nextRole(a[hit.id] ?? 'unused')));
  }

  function handleLongPress(point: Point) {
    const hit = hitTest(point);
    if (hit) setLongPressHoldId(hit.id);
  }

  function pickRole(role: HoldRole) {
    if (longPressHoldId) setAssignments((a) => setHoldRole(a, longPressHoldId, role));
    setLongPressHoldId(null);
  }

  const validHoldIds = new Set(wall.holds.map((h) => h.id));
  const missingCount = Object.keys(assignments).filter((id) => !validHoldIds.has(id)).length;

  const startCount = Object.values(assignments).filter((r) => r === 'start').length;
  const finishCount = Object.values(assignments).filter((r) => r === 'finish').length;
  const warnings: string[] = [];
  if (startCount > 2) warnings.push('More than 2 start holds selected.');
  if (startCount === 0) warnings.push('No start hold selected — climbers won’t know where to begin.');
  if (finishCount === 0) warnings.push('No finish hold selected.');

  async function handleConfirmSave() {
    rememberGradeSystem(meta.gradeSystem);
    if (isNew) {
      const created = await createRoute({ wallId: wall!.id, name: meta.name, gradeSystem: meta.gradeSystem });
      await updateRoute(created.id, {
        assignments,
        grade: meta.grade,
        footRule: meta.footRule,
        notes: meta.notes,
        name: meta.name,
        gradeSystem: meta.gradeSystem,
      });
    } else if (route) {
      await updateRoute(route.id, { assignments, ...meta });
    }
    navigate(`/walls/${wall!.id}`);
  }

  const gradeOptions = meta.gradeSystem === 'v' ? V_GRADES : FONT_GRADES;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/walls/${wall.id}`} className="shrink-0 text-neutral-400">
            ← Cancel
          </Link>
          <h1 className="truncate text-lg font-semibold">{meta.name}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          {!isNew && (
            <Link
              to={`/routes/${routeId}/view`}
              className="rounded-full bg-neutral-800 px-3 py-1.5 text-sm"
            >
              View
            </Link>
          )}
          <button
            className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => setShowMetaSheet(true)}
          >
            Save
          </button>
        </div>
      </header>

      {missingCount > 0 && (
        <div className="mx-4 mb-2 rounded-lg bg-yellow-900/40 px-3 py-2 text-sm text-yellow-200">
          {missingCount} hold{missingCount === 1 ? '' : 's'} from this route no longer{' '}
          {missingCount === 1 ? 'exists' : 'exist'} on the wall.
        </div>
      )}

      <div className="min-h-0 flex-1">
        {photoUrl && (
          <PhotoStage
            photoUrl={photoUrl}
            imageWidth={wall.photoWidth}
            imageHeight={wall.photoHeight}
            onTap={handleTap}
            onLongPress={handleLongPress}
          >
            {({ totalScale }) =>
              wall.holds.map((hold) => (
                <HoldShape
                  key={hold.id}
                  hold={hold}
                  role={assignments[hold.id] ?? 'unused'}
                  totalScale={totalScale}
                  showNeutralOutline
                  selected={hold.id === longPressHoldId}
                />
              ))
            }
          </PhotoStage>
        )}
      </div>

      {longPressHoldId && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/60"
          onClick={() => setLongPressHoldId(null)}
        >
          <div
            className="w-full rounded-t-2xl bg-neutral-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm text-neutral-400">Set role</p>
            <div className="grid grid-cols-5 gap-2">
              {ROLE_LABELS.map(({ role, label }) => (
                <button
                  key={role}
                  className="rounded-lg bg-neutral-800 px-2 py-3 text-xs font-medium"
                  onClick={() => pickRole(role)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showMetaSheet && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/60"
          onClick={() => setShowMetaSheet(false)}
        >
          <div
            className="flex max-h-[85vh] w-full flex-col gap-3 overflow-y-auto rounded-t-2xl bg-neutral-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Route details</h2>

            {warnings.length > 0 && (
              <div className="space-y-1 rounded-lg bg-yellow-900/40 px-3 py-2 text-sm text-yellow-200">
                {warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm text-neutral-300">
              Name
              <input
                className="rounded-lg bg-neutral-800 px-3 py-2 text-base text-neutral-50"
                value={meta.name}
                onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
              />
            </label>

            <div className="flex flex-col gap-1.5 text-sm text-neutral-300">
              Grade
              <div className="flex gap-2">
                <div className="flex overflow-hidden rounded-lg bg-neutral-800">
                  {(['v', 'font'] as const).map((system) => (
                    <button
                      key={system}
                      className={`px-3 py-2 text-sm ${meta.gradeSystem === system ? 'bg-blue-600 text-white' : ''}`}
                      onClick={() => setMeta((m) => ({ ...m, gradeSystem: system, grade: null }))}
                    >
                      {system === 'v' ? 'V-scale' : 'Font'}
                    </button>
                  ))}
                </div>
                <select
                  className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-base text-neutral-50"
                  value={meta.grade ?? ''}
                  onChange={(e) => setMeta((m) => ({ ...m, grade: e.target.value || null }))}
                >
                  <option value="">Ungraded</option>
                  {gradeOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-sm text-neutral-300">
              Foot rule
              <select
                className="rounded-lg bg-neutral-800 px-3 py-2 text-base text-neutral-50"
                value={meta.footRule}
                onChange={(e) => setMeta((m) => ({ ...m, footRule: e.target.value as FootRule }))}
              >
                {FOOT_RULES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-neutral-300">
              Notes
              <textarea
                className="rounded-lg bg-neutral-800 px-3 py-2 text-base text-neutral-50"
                rows={3}
                value={meta.notes}
                onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))}
              />
            </label>

            <div className="mt-2 flex gap-3">
              <button
                className="flex-1 rounded-full bg-neutral-800 px-4 py-3 text-sm font-medium"
                onClick={() => setShowMetaSheet(false)}
              >
                Keep editing
              </button>
              <button
                className="flex-1 rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white"
                onClick={handleConfirmSave}
              >
                Save route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
