import type { HoldRole } from '../types/models';

export interface RoleStyle {
  stroke: string | null;
  strokeWidthPx: number;
  dashed: boolean;
  fill: string | null;
  fillOpacity: number;
  badge: string | null;
}

/** Visual language for each hold role, matching the spec's table (kept legible in a bright gym). */
export const ROLE_STYLES: Record<HoldRole, RoleStyle> = {
  unused: { stroke: null, strokeWidthPx: 0, dashed: false, fill: null, fillOpacity: 0, badge: null },
  start: { stroke: '#22c55e', strokeWidthPx: 4, dashed: false, fill: '#22c55e', fillOpacity: 0.18, badge: 'S' },
  hand: { stroke: '#3b82f6', strokeWidthPx: 4, dashed: false, fill: '#3b82f6', fillOpacity: 0.18, badge: null },
  foot: { stroke: '#eab308', strokeWidthPx: 3, dashed: true, fill: '#eab308', fillOpacity: 0.12, badge: 'F' },
  finish: { stroke: '#ef4444', strokeWidthPx: 4, dashed: false, fill: '#ef4444', fillOpacity: 0.18, badge: 'T' },
};
