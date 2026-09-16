import { describe, expect, it } from 'vitest';
import {
  bgDeltaEToSensitivity,
  minAreaFracToSlider,
  sensitivityToBgDeltaE,
  sliderToMinAreaFrac,
} from './sliderMapping';

describe('sensitivity <-> bgDeltaE', () => {
  it('higher sensitivity means a lower threshold', () => {
    expect(sensitivityToBgDeltaE(100)).toBeLessThan(sensitivityToBgDeltaE(0));
  });
  it('round-trips approximately', () => {
    const original = 12;
    const roundTripped = sensitivityToBgDeltaE(bgDeltaEToSensitivity(original));
    expect(roundTripped).toBeCloseTo(original, -1);
  });
});

describe('minAreaFrac slider', () => {
  it('is monotonically increasing with the slider', () => {
    expect(sliderToMinAreaFrac(100)).toBeGreaterThan(sliderToMinAreaFrac(0));
  });
  it('round-trips approximately', () => {
    const original = 0.00008;
    const roundTripped = sliderToMinAreaFrac(minAreaFracToSlider(original));
    expect(roundTripped).toBeCloseTo(original, 4);
  });
});
