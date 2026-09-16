import type { DetectionParams } from '../types/models';

export interface ComponentStats {
  area: number;
  width: number;
  height: number;
}

/** area / bbox area. */
export function fillRatio(stats: ComponentStats): number {
  const bboxArea = stats.width * stats.height;
  return bboxArea > 0 ? stats.area / bboxArea : 0;
}

/** longer side / shorter side, >= 1. */
export function aspectRatio(stats: ComponentStats): number {
  const shorter = Math.min(stats.width, stats.height);
  return shorter > 0 ? Math.max(stats.width, stats.height) / shorter : Infinity;
}

/** 4*pi*area / perimeter^2; 1 for a perfect circle, lower for irregular shapes. */
export function circularity(area: number, perimeter: number): number {
  return perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
}

/** True for a small, round blob that's almost certainly a T-nut bolt hole, not a climbing hold. */
export function isBoltHole(area: number, perimeter: number, minAreaPx: number): boolean {
  return area < minAreaPx && circularity(area, perimeter) > 0.7;
}

/** The §6 step-5 survivor filter: area range, fill ratio, aspect ratio. */
export function passesHoldFilters(
  stats: ComponentStats,
  params: DetectionParams,
  imageArea: number,
): boolean {
  const minArea = params.minAreaFrac * imageArea;
  const maxArea = params.maxAreaFrac * imageArea;
  if (stats.area < minArea || stats.area > maxArea) return false;
  if (fillRatio(stats) < params.minFillRatio) return false;
  if (aspectRatio(stats) > params.maxAspect) return false;
  return true;
}
