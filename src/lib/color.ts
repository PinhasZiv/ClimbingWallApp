/**
 * sRGB -> OpenCV's 8-bit Lab encoding (cv::cvtColor(..., COLOR_RGB2Lab) on a CV_8U image):
 * true CIE L*a*b* with L scaled to [0,255] and a/b offset by 128. The detection pipeline's
 * per-pixel deltaE math reads straight from that 8-bit Lab Mat, so a user-picked "wall colour"
 * sample has to land in the exact same numeric space to compare correctly.
 */

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 };

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

export function rgbToOpenCvLab8u(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.715152 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;

  const fx = labF(x / D65.x);
  const fy = labF(y / D65.y);
  const fz = labF(z / D65.z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);

  return [clamp255((L * 255) / 100), clamp255(a + 128), clamp255(bLab + 128)];
}
