import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  clampPan,
  clampZoom,
  computeBaseScale,
  screenToImage,
  type ViewTransform,
  type ViewportMetrics,
} from '../lib/coords';
import type { Point } from '../lib/geometry';

const TAP_MOVE_THRESHOLD_PX = 8;
const LONG_PRESS_MS = 500;

export interface StageRenderContext {
  view: ViewTransform;
  /** image-px -> physical screen-px scale; divide a desired screen-px stroke width by this. */
  totalScale: number;
}

interface PhotoStageProps {
  photoUrl: string;
  imageWidth: number;
  imageHeight: number;
  /** SVG overlay content, in image-pixel coordinate space (viewBox matches image dims). */
  children?: (ctx: StageRenderContext) => ReactNode;
  onTap?: (point: Point) => void;
  onLongPress?: (point: Point) => void;
}

export default function PhotoStage({
  photoUrl,
  imageWidth,
  imageHeight,
  children,
  onTap,
  onLongPress,
}: PhotoStageProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ scale: 1, panX: 0, panY: 0 });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setContainerSize({ width: box.width, height: box.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const metrics: ViewportMetrics = {
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    imageWidth,
    imageHeight,
  };

  // Read inside the native (non-passive) wheel listener below, which is attached once
  // and shouldn't be torn down/rebuilt on every pan/zoom render.
  const latest = useRef({ view, metrics });
  useEffect(() => {
    latest.current = { view, metrics };
  });

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: 'none' | 'tap-candidate' | 'panning' | 'pinching';
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    startDist: number;
    startScale: number;
    anchorImage: Point;
    longPressTimer: ReturnType<typeof setTimeout> | null;
  }>({
    kind: 'none',
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    startDist: 0,
    startScale: 1,
    anchorImage: [0, 0],
    longPressTimer: null,
  });

  function clearLongPressTimer() {
    if (gesture.current.longPressTimer) {
      clearTimeout(gesture.current.longPressTimer);
      gesture.current.longPressTimer = null;
    }
  }

  function relativePos(e: React.PointerEvent): { x: number; y: number } {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent) {
    viewportRef.current?.setPointerCapture(e.pointerId);
    const pos = relativePos(e);
    pointers.current.set(e.pointerId, pos);

    if (pointers.current.size === 1) {
      clearLongPressTimer();
      const g = gesture.current;
      g.kind = 'tap-candidate';
      g.startX = pos.x;
      g.startY = pos.y;
      g.startPanX = view.panX;
      g.startPanY = view.panY;
      g.longPressTimer = setTimeout(() => {
        if (gesture.current.kind === 'tap-candidate') {
          gesture.current.kind = 'none';
          onLongPress?.(screenToImage([pos.x, pos.y], view, metrics));
        }
      }, LONG_PRESS_MS);
    } else if (pointers.current.size === 2) {
      clearLongPressTimer();
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midpoint: Point = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
      const g = gesture.current;
      g.kind = 'pinching';
      g.startDist = dist;
      g.startScale = view.scale;
      g.anchorImage = screenToImage(midpoint, view, metrics);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const pos = relativePos(e);
    pointers.current.set(e.pointerId, pos);
    const g = gesture.current;

    if (g.kind === 'pinching' && pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midpoint: Point = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
      const newScale = clampZoom(g.startScale * (dist / Math.max(1, g.startDist)));
      const baseScale = computeBaseScale(metrics);
      const totalScale = baseScale * newScale;
      const fittedW = metrics.imageWidth * baseScale;
      const fittedH = metrics.imageHeight * baseScale;
      const lbX = (metrics.containerWidth - fittedW) / 2;
      const lbY = (metrics.containerHeight - fittedH) / 2;
      const rawPan = {
        x: midpoint[0] - lbX - g.anchorImage[0] * totalScale,
        y: midpoint[1] - lbY - g.anchorImage[1] * totalScale,
      };
      const nextView = { scale: newScale, panX: rawPan.x, panY: rawPan.y };
      const clamped = clampPan(rawPan, nextView, metrics);
      setView({ scale: newScale, panX: clamped.x, panY: clamped.y });
    } else if (g.kind === 'tap-candidate' || g.kind === 'panning') {
      const dx = pos.x - g.startX;
      const dy = pos.y - g.startY;
      if (g.kind === 'tap-candidate' && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD_PX) {
        g.kind = 'panning';
        clearLongPressTimer();
      }
      if (g.kind === 'panning') {
        const raw = { x: g.startPanX + dx, y: g.startPanY + dy };
        const clamped = clampPan(raw, view, metrics);
        setView((v) => ({ ...v, panX: clamped.x, panY: clamped.y }));
      }
    }
  }

  function endPointer(e: React.PointerEvent) {
    const wasTap = gesture.current.kind === 'tap-candidate';
    const pos = pointers.current.get(e.pointerId) ?? relativePos(e);
    pointers.current.delete(e.pointerId);
    clearLongPressTimer();

    if (pointers.current.size === 0) {
      if (wasTap) {
        onTap?.(screenToImage([pos.x, pos.y], view, metrics));
      }
      gesture.current.kind = 'none';
    } else {
      // Dropped from 2 pointers to 1: stop the gesture rather than jumping into a pan.
      gesture.current.kind = 'none';
    }
  }

  // React attaches wheel listeners passively by default, so e.preventDefault() inside a
  // JSX onWheel handler silently fails in some browsers. Attach natively with
  // { passive: false } instead, so scroll-to-zoom doesn't also scroll the page.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const { view, metrics } = latest.current;
      const rect = el!.getBoundingClientRect();
      const pos: Point = [e.clientX - rect.left, e.clientY - rect.top];
      const anchorImage = screenToImage(pos, view, metrics);
      const newScale = clampZoom(view.scale * (1 - e.deltaY * 0.001));
      const baseScale = computeBaseScale(metrics);
      const totalScale = baseScale * newScale;
      const fittedW = metrics.imageWidth * baseScale;
      const fittedH = metrics.imageHeight * baseScale;
      const lbX = (metrics.containerWidth - fittedW) / 2;
      const lbY = (metrics.containerHeight - fittedH) / 2;
      const rawPan = {
        x: pos[0] - lbX - anchorImage[0] * totalScale,
        y: pos[1] - lbY - anchorImage[1] * totalScale,
      };
      const nextView = { scale: newScale, panX: rawPan.x, panY: rawPan.y };
      const clamped = clampPan(rawPan, nextView, metrics);
      setView({ scale: newScale, panX: clamped.x, panY: clamped.y });
    }
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const baseScale = computeBaseScale(metrics);
  const fittedW = imageWidth * baseScale;
  const fittedH = imageHeight * baseScale;
  const lbX = (metrics.containerWidth - fittedW) / 2;
  const lbY = (metrics.containerHeight - fittedH) / 2;

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-black"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {containerSize.width > 0 && (
        <div
          style={{
            position: 'absolute',
            left: lbX,
            top: lbY,
            width: fittedW,
            height: fittedH,
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <img
            src={photoUrl}
            alt="Wall"
            draggable={false}
            className="block h-full w-full"
            style={{ pointerEvents: 'none' }}
          />
          <svg
            viewBox={`0 0 ${imageWidth} ${imageHeight}`}
            className="absolute inset-0 h-full w-full"
            style={{ pointerEvents: 'none' }}
          >
            {children?.({ view, totalScale: baseScale * view.scale })}
          </svg>
        </div>
      )}
    </div>
  );
}
