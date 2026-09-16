import { describe, expect, it } from 'vitest';
import { aspectRatio, circularity, fillRatio, isBoltHole, passesHoldFilters } from './filters';
import { DEFAULT_DETECTION_PARAMS } from '../types/models';

describe('fillRatio', () => {
  it('is 1 for a shape that exactly fills its bbox', () => {
    expect(fillRatio({ area: 100, width: 10, height: 10 })).toBe(1);
  });
  it('is lower for a sparse shape', () => {
    expect(fillRatio({ area: 50, width: 10, height: 10 })).toBe(0.5);
  });
});

describe('aspectRatio', () => {
  it('is 1 for a square', () => {
    expect(aspectRatio({ area: 100, width: 10, height: 10 })).toBe(1);
  });
  it('is >1 for an elongated shape, regardless of orientation', () => {
    expect(aspectRatio({ area: 100, width: 20, height: 5 })).toBe(4);
    expect(aspectRatio({ area: 100, width: 5, height: 20 })).toBe(4);
  });
});

describe('circularity', () => {
  it('is close to 1 for a circle (4*pi*area = perimeter^2)', () => {
    const radius = 10;
    const area = Math.PI * radius * radius;
    const perimeter = 2 * Math.PI * radius;
    expect(circularity(area, perimeter)).toBeCloseTo(1, 5);
  });
  it('is lower for a thin elongated shape', () => {
    // a 1x20 rectangle: area 20, perimeter 42
    expect(circularity(20, 42)).toBeLessThan(0.2);
  });
});

describe('isBoltHole', () => {
  it('flags small, round, dark blobs', () => {
    const radius = 3;
    const area = Math.PI * radius * radius;
    const perimeter = 2 * Math.PI * radius;
    expect(isBoltHole(area, perimeter, 100)).toBe(true);
  });
  it('does not flag a small but non-round blob', () => {
    // thin sliver: small area, high perimeter -> low circularity
    expect(isBoltHole(10, 40, 100)).toBe(false);
  });
  it('does not flag a round blob that is too large to be a bolt hole', () => {
    const radius = 20;
    const area = Math.PI * radius * radius;
    const perimeter = 2 * Math.PI * radius;
    expect(isBoltHole(area, perimeter, 100)).toBe(false);
  });
});

describe('passesHoldFilters', () => {
  const imageArea = 1_000_000;

  it('accepts a well-formed hold-sized component at default params', () => {
    // ~0.001 of image area, square-ish, full fill
    expect(
      passesHoldFilters({ area: 1000, width: 32, height: 32 }, DEFAULT_DETECTION_PARAMS, imageArea),
    ).toBe(true);
  });

  it('rejects a component smaller than minAreaFrac', () => {
    expect(passesHoldFilters({ area: 10, width: 4, height: 4 }, DEFAULT_DETECTION_PARAMS, imageArea)).toBe(
      false,
    );
  });

  it('rejects a component larger than maxAreaFrac', () => {
    expect(
      passesHoldFilters({ area: 30000, width: 200, height: 200 }, DEFAULT_DETECTION_PARAMS, imageArea),
    ).toBe(false);
  });

  it('rejects a sparse component below minFillRatio (e.g. a wall seam)', () => {
    expect(
      passesHoldFilters({ area: 200, width: 100, height: 20 }, DEFAULT_DETECTION_PARAMS, imageArea),
    ).toBe(false);
  });

  it('rejects an overly elongated component above maxAspect', () => {
    expect(
      passesHoldFilters({ area: 1000, width: 500, height: 10 }, DEFAULT_DETECTION_PARAMS, imageArea),
    ).toBe(false);
  });
});
