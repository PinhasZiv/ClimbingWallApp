import { describe, expect, it } from 'vitest';
import { imageToScreen, screenToImage, type ViewTransform, type ViewportMetrics } from './coords';

const metrics: ViewportMetrics = {
  containerWidth: 390,
  containerHeight: 700,
  imageWidth: 2000,
  imageHeight: 1000,
};

describe('screen <-> image coordinate inversion', () => {
  it('round-trips at fit zoom with no pan', () => {
    const view: ViewTransform = { scale: 1, panX: 0, panY: 0 };
    const original: [number, number] = [534, 217];
    const screen = imageToScreen(original, view, metrics);
    const roundTripped = screenToImage(screen, view, metrics);
    expect(roundTripped[0]).toBeCloseTo(original[0], 6);
    expect(roundTripped[1]).toBeCloseTo(original[1], 6);
  });

  it('round-trips at max zoom with pan applied', () => {
    const view: ViewTransform = { scale: 6, panX: -812, panY: 143 };
    const original: [number, number] = [1200, 640];
    const screen = imageToScreen(original, view, metrics);
    const roundTripped = screenToImage(screen, view, metrics);
    expect(roundTripped[0]).toBeCloseTo(original[0], 6);
    expect(roundTripped[1]).toBeCloseTo(original[1], 6);
  });

  it('round-trips for many random points and zoom/pan combinations', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) {
      const view: ViewTransform = {
        scale: 1 + rand() * 5,
        panX: (rand() - 0.5) * 2000,
        panY: (rand() - 0.5) * 2000,
      };
      const original: [number, number] = [rand() * metrics.imageWidth, rand() * metrics.imageHeight];
      const screen = imageToScreen(original, view, metrics);
      const roundTripped = screenToImage(screen, view, metrics);
      expect(roundTripped[0]).toBeCloseTo(original[0], 6);
      expect(roundTripped[1]).toBeCloseTo(original[1], 6);
    }
  });

  it('maps the image center to the container center at fit zoom, no pan', () => {
    const view: ViewTransform = { scale: 1, panX: 0, panY: 0 };
    // image is wider-than-tall relative to a 390x700 container, so it fits
    // to container width and is letterboxed vertically
    const center: [number, number] = [metrics.imageWidth / 2, metrics.imageHeight / 2];
    const screen = imageToScreen(center, view, metrics);
    expect(screen[0]).toBeCloseTo(metrics.containerWidth / 2, 6);
    expect(screen[1]).toBeCloseTo(metrics.containerHeight / 2, 6);
  });
});
