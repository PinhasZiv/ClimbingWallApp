import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../db/db';
import { DEFAULT_DETECTION_PARAMS, type Wall } from '../types/models';

export function useWalls() {
  const walls = useLiveQuery(() => db.walls.orderBy('updatedAt').reverse().toArray(), [], []);
  return { walls, loading: walls === undefined };
}

export function useWall(id: string | undefined) {
  const wall = useLiveQuery(() => (id ? db.walls.get(id) : undefined), [id]);
  return { wall, loading: wall === undefined };
}

export interface CreateWallInput {
  name: string;
  photoBlobKey: string;
  photoWidth: number;
  photoHeight: number;
}

export async function createWall(input: CreateWallInput): Promise<Wall> {
  const now = Date.now();
  const wall: Wall = {
    id: uuid(),
    name: input.name,
    photoBlobKey: input.photoBlobKey,
    photoWidth: input.photoWidth,
    photoHeight: input.photoHeight,
    holds: [],
    deletedAutoIds: [],
    detectionParams: DEFAULT_DETECTION_PARAMS,
    createdAt: now,
    updatedAt: now,
  };
  await db.walls.add(wall);
  return wall;
}

export async function updateWall(id: string, changes: Partial<Omit<Wall, 'id'>>): Promise<void> {
  await db.walls.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteWall(id: string): Promise<void> {
  await db.transaction('rw', db.walls, db.routes, db.blobs, async () => {
    const wall = await db.walls.get(id);
    const routeIds = await db.routes.where('wallId').equals(id).primaryKeys();
    await db.routes.bulkDelete(routeIds);
    await db.walls.delete(id);
    if (wall) await db.blobs.delete(wall.photoBlobKey);
  });
}
