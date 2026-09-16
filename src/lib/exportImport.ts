import { db } from '../db/db';
import { base64ToBytes, bytesToBase64 } from './base64';
import type { Route, Wall } from '../types/models';

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportedWall extends Omit<Wall, 'photoBlobKey'> {
  photoBase64: string;
  photoMimeType: string;
}

export interface ExportPayload {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: number;
  walls: ExportedWall[];
  routes: Route[];
}

export async function buildExportPayload(): Promise<ExportPayload> {
  const [walls, routes] = await Promise.all([db.walls.toArray(), db.routes.toArray()]);

  const exportedWalls = await Promise.all(
    walls.map(async (wall): Promise<ExportedWall> => {
      const { photoBlobKey, ...rest } = wall;
      const record = await db.blobs.get(photoBlobKey);
      const blob = record?.blob ?? new Blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { ...rest, photoBase64: bytesToBase64(bytes), photoMimeType: blob.type || 'image/jpeg' };
    }),
  );

  return { formatVersion: EXPORT_FORMAT_VERSION, exportedAt: Date.now(), walls: exportedWalls, routes };
}

export function serializeExportPayload(payload: ExportPayload): string {
  return JSON.stringify(payload);
}

export function parseExportPayload(json: string): ExportPayload {
  const data = JSON.parse(json);
  if (data?.formatVersion !== EXPORT_FORMAT_VERSION || !Array.isArray(data.walls) || !Array.isArray(data.routes)) {
    throw new Error('Not a recognised export file.');
  }
  return data as ExportPayload;
}

export type ConflictStrategy = 'skip' | 'overwrite';

export interface ImportPlan {
  wallsToWrite: ExportedWall[];
  routesToWrite: Route[];
  skippedWallIds: string[];
  skippedRouteIds: string[];
}

/**
 * Decide which incoming walls/routes to write given which ids already exist locally — pure,
 * so the id-conflict decision is unit-testable without touching Dexie or real blobs.
 */
export function planImport(
  payload: ExportPayload,
  existingWallIds: ReadonlySet<string>,
  existingRouteIds: ReadonlySet<string>,
  strategy: ConflictStrategy,
): ImportPlan {
  const wallsToWrite: ExportedWall[] = [];
  const skippedWallIds: string[] = [];
  for (const wall of payload.walls) {
    if (existingWallIds.has(wall.id) && strategy === 'skip') {
      skippedWallIds.push(wall.id);
    } else {
      wallsToWrite.push(wall);
    }
  }

  const routesToWrite: Route[] = [];
  const skippedRouteIds: string[] = [];
  for (const route of payload.routes) {
    if (existingRouteIds.has(route.id) && strategy === 'skip') {
      skippedRouteIds.push(route.id);
    } else {
      routesToWrite.push(route);
    }
  }

  return { wallsToWrite, routesToWrite, skippedWallIds, skippedRouteIds };
}

export interface ImportResult {
  importedWalls: number;
  importedRoutes: number;
  skippedWalls: number;
  skippedRoutes: number;
}

export async function applyImportPayload(payload: ExportPayload, strategy: ConflictStrategy): Promise<ImportResult> {
  const [existingWalls, existingRoutes] = await Promise.all([
    db.walls.toCollection().primaryKeys(),
    db.routes.toCollection().primaryKeys(),
  ]);
  const plan = planImport(
    payload,
    new Set(existingWalls as string[]),
    new Set(existingRoutes as string[]),
    strategy,
  );

  await db.transaction('rw', db.walls, db.routes, db.blobs, async () => {
    for (const exportedWall of plan.wallsToWrite) {
      const { photoBase64, photoMimeType, ...wall } = exportedWall;
      const blob = new Blob([base64ToBytes(photoBase64).slice()], { type: photoMimeType });
      // Deterministic key (the wall's own id) rather than a fresh uuid: idempotent on
      // re-import/overwrite, and never orphans a blob under a key nothing references.
      const photoBlobKey = wall.id;
      await db.blobs.put({ key: photoBlobKey, blob });
      await db.walls.put({ ...wall, photoBlobKey });
    }
    for (const route of plan.routesToWrite) {
      await db.routes.put(route);
    }
  });

  return {
    importedWalls: plan.wallsToWrite.length,
    importedRoutes: plan.routesToWrite.length,
    skippedWalls: plan.skippedWallIds.length,
    skippedRoutes: plan.skippedRouteIds.length,
  };
}
