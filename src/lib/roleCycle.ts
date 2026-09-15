import { ROLE_CYCLE, type HoldRole } from '../types/models';

/** unused -> start -> hand -> foot -> finish -> unused */
export function nextRole(current: HoldRole): HoldRole {
  const idx = ROLE_CYCLE.indexOf(current);
  return ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length];
}
