import type { Point } from './geometry';

/**
 * Pan/zoom state applied as a CSS transform (translate then scale, origin
 * 0,0) on the "stage" div that holds the fitted-size photo + SVG overlay.
 * `scale` is relative to the fit-to-screen baseline (1 = fit, up to 6).
 */
export interface ViewTransform {
  scale: number;
  panX: number;
  panY: number;
}

export interface ViewportMetrics {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

/** Scale that fits the whole image inside the container (letterboxed). This is zoom level 1. */
export function computeBaseScale(m: ViewportMetrics): number {
  if (m.imageWidth <= 0 || m.imageHeight <= 0) return 1;
  return Math.min(m.containerWidth / m.imageWidth, m.containerHeight / m.imageHeight);
}

function letterbox(m: ViewportMetrics, baseScale: number): { x: number; y: number } {
  return {
    x: (m.containerWidth - m.imageWidth * baseScale) / 2,
    y: (m.containerHeight - m.imageHeight * baseScale) / 2,
  };
}

/** Image pixel coordinates -> screen coordinates relative to the viewport container's top-left. */
export function imageToScreen(point: Point, view: ViewTransform, metrics: ViewportMetrics): Point {
  const baseScale = computeBaseScale(metrics);
  const totalScale = baseScale * view.scale;
  const { x: lbX, y: lbY } = letterbox(metrics, baseScale);
  return [lbX + view.panX + point[0] * totalScale, lbY + view.panY + point[1] * totalScale];
}

/** Inverse of imageToScreen: screen coordinates (relative to the viewport container) -> image pixel coordinates. */
export function screenToImage(point: Point, view: ViewTransform, metrics: ViewportMetrics): Point {
  const baseScale = computeBaseScale(metrics);
  const totalScale = baseScale * view.scale;
  const { x: lbX, y: lbY } = letterbox(metrics, baseScale);
  return [(point[0] - lbX - view.panX) / totalScale, (point[1] - lbY - view.panY) / totalScale];
}

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/**
 * Clamp pan so the image can't be dragged further than roughly one
 * screen-width past its edge, in either axis, at the given zoom.
 */
export function clampPan(
  pan: { x: number; y: number },
  view: ViewTransform,
  metrics: ViewportMetrics,
): { x: number; y: number } {
  const baseScale = computeBaseScale(metrics);
  const fittedW = metrics.imageWidth * baseScale;
  const fittedH = metrics.imageHeight * baseScale;
  const scaledW = fittedW * view.scale;
  const scaledH = fittedH * view.scale;
  const maxPanX = Math.max(0, (scaledW - metrics.containerWidth) / 2 + fittedW * 0.4);
  const maxPanY = Math.max(0, (scaledH - metrics.containerHeight) / 2 + fittedH * 0.4);
  return {
    x: Math.min(maxPanX, Math.max(-maxPanX, pan.x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, pan.y)),
  };
}
