import { describe, expect, it } from 'vitest';
import { rgbToOpenCvLab8u } from './color';

function expectNeutral(a: number, b: number) {
  expect(Math.abs(a - 128)).toBeLessThan(3);
  expect(Math.abs(b - 128)).toBeLessThan(3);
}

describe('rgbToOpenCvLab8u', () => {
  it('maps black to L near 0, neutral a/b near 128', () => {
    const [l, a, b] = rgbToOpenCvLab8u(0, 0, 0);
    expect(l).toBeLessThan(5);
    expectNeutral(a, b);
  });

  it('maps white to L near 255, neutral a/b near 128', () => {
    const [l, a, b] = rgbToOpenCvLab8u(255, 255, 255);
    expect(l).toBeGreaterThan(250);
    expectNeutral(a, b);
  });

  it('maps mid-gray to a mid L with neutral a/b', () => {
    const [l, a, b] = rgbToOpenCvLab8u(128, 128, 128);
    expect(l).toBeGreaterThan(100);
    expect(l).toBeLessThan(180);
    expectNeutral(a, b);
  });

  it('gives saturated red a positive a (red-green axis)', () => {
    const [, a] = rgbToOpenCvLab8u(220, 30, 30);
    expect(a).toBeGreaterThan(150);
  });
});
