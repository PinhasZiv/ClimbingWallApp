import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../db/db';
import type { FootRule, GradeSystem, HoldRole, Route } from '../types/models';

export function useRoutesForWall(wallId: string | undefined) {
  const routes = useLiveQuery(
    () => (wallId ? db.routes.where('wallId').equals(wallId).reverse().sortBy('updatedAt') : []),
    [wallId],
    [],
  );
  return { routes, loading: routes === undefined };
}

export function useRoute(id: string | undefined) {
  const route = useLiveQuery(() => (id ? db.routes.get(id) : undefined), [id]);
  return { route, loading: route === undefined };
}

export interface CreateRouteInput {
  wallId: string;
  name: string;
  gradeSystem?: GradeSystem;
}

export async function createRoute(input: CreateRouteInput): Promise<Route> {
  const now = Date.now();
  const route: Route = {
    id: uuid(),
    wallId: input.wallId,
    name: input.name,
    grade: null,
    gradeSystem: input.gradeSystem ?? 'v',
    assignments: {},
    footRule: 'marked-only',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  await db.routes.add(route);
  return route;
}

export async function updateRoute(id: string, changes: Partial<Omit<Route, 'id'>>): Promise<void> {
  await db.routes.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteRoute(id: string): Promise<void> {
  await db.routes.delete(id);
}

export function setHoldRole(
  assignments: Record<string, HoldRole>,
  holdId: string,
  role: HoldRole,
): Record<string, HoldRole> {
  const next = { ...assignments };
  if (role === 'unused') {
    delete next[holdId];
  } else {
    next[holdId] = role;
  }
  return next;
}

export const FOOT_RULES: { value: FootRule; label: string }[] = [
  { value: 'marked-only', label: 'Feet: marked holds only' },
  { value: 'any-hold', label: 'Feet: any hold on the wall' },
  { value: 'feet-follow-hands', label: 'Feet: follow hands' },
];
