import type { CV, Mat } from '@techstark/opencv-js';
import type { DetectionParams } from '../types/models';
import { median, pointInPolygon, sortHoldsRowMajor, type Point } from '../lib/geometry';
import { isBoltHole, passesHoldFilters } from './filters';

export interface DetectRawHold {
  polygon: Point[];
  centroid: Point;
  bbox: [number, number, number, number];
  areaPx: number;
  meanColorLab: [number, number, number];
}

/** A single connected component isolated into its own bbox-sized mask, in local (mask) coordinates. */
interface Candidate {
  mask: Mat;
  offsetX: number;
  offsetY: number;
  area: number;
}

const WATERSHED_SPLIT_AREA_MULTIPLIER = 2.5;

export interface DetectionPipelineResult {
  holds: DetectRawHold[];
  wallLabUsed: [number, number, number];
}

export function runDetectionPipeline(
  cv: CV,
  imageData: ImageData,
  params: DetectionParams,
  wallLabOverride: [number, number, number] | null,
  onProgress: (stage: string) => void,
): DetectionPipelineResult {
  const width = imageData.width;
  const height = imageData.height;
  const imageArea = width * height;

  const rgba = cv.matFromImageData(imageData);
  const rgb = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  rgba.delete();

  const lab = new cv.Mat();
  cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);

  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  rgb.delete();

  onProgress('sampling background');
  const wallLab = wallLabOverride ?? sampleBackgroundLab(lab, width, height);

  onProgress('building mask');
  const mask = buildCandidateMask(cv, lab, hsv, wallLab, params.bgDeltaE, params.satBoost);
  hsv.delete();

  onProgress('removing bolt holes');
  removeTNutHoles(cv, mask, params.minAreaFrac * imageArea);

  onProgress('morphology');
  applyMorphology(cv, mask);

  onProgress('finding components');
  let candidates = extractCandidates(cv, mask, params, imageArea);
  mask.delete();

  onProgress('splitting touching holds');
  if (params.splitTouching && candidates.length > 0) {
    candidates = splitTouchingCandidates(cv, candidates);
  }

  onProgress('extracting geometry');
  const holds = candidates.map((c) => extractGeometry(cv, c, lab));
  for (const c of candidates) c.mask.delete();
  lab.delete();

  return { holds: sortHoldsRowMajor(holds), wallLabUsed: wallLab };
}

function sampleBackgroundLab(lab: Mat, width: number, height: number): [number, number, number] {
  const step = Math.max(4, Math.round(Math.min(width, height) / 120));
  const buckets = new Map<string, { count: number; sumL: number; sumA: number; sumB: number }>();
  const data = lab.data as Uint8Array;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 3;
      const l = data[idx];
      const a = data[idx + 1];
      const b = data[idx + 2];
      const key = `${l >> 5}-${a >> 5}-${b >> 5}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count++;
        bucket.sumL += l;
        bucket.sumA += a;
        bucket.sumB += b;
      } else {
        buckets.set(key, { count: 1, sumL: l, sumA: a, sumB: b });
      }
    }
  }

  let best: { count: number; sumL: number; sumA: number; sumB: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return [128, 128, 128];
  return [best.sumL / best.count, best.sumA / best.count, best.sumB / best.count];
}

function buildCandidateMask(
  cv: CV,
  lab: Mat,
  hsv: Mat,
  wallLab: [number, number, number],
  bgDeltaE: number,
  satBoost: number,
): Mat {
  const width = lab.cols;
  const height = lab.rows;

  // maskA: deltaE76(pixelLab, wallLab) > bgDeltaE. Done as a plain typed-array pass rather
  // than cv ops on a broadcast Scalar — opencv.js's Mat/Scalar arithmetic overloads are
  // inconsistent across builds, and this is a single cheap pass over the (downscaled,
  // <=1200px) detection copy.
  const maskA = new cv.Mat(height, width, cv.CV_8UC1);
  const labData = lab.data as Uint8Array;
  const maskAData = maskA.data as Uint8Array;
  const thresholdSq = bgDeltaE * bgDeltaE;
  const [wl, wa, wb] = wallLab;
  for (let px = 0, li = 0; px < maskAData.length; px++, li += 3) {
    const dl = labData[li] - wl;
    const da = labData[li + 1] - wa;
    const db = labData[li + 2] - wb;
    maskAData[px] = dl * dl + da * da + db * db > thresholdSq ? 255 : 0;
  }

  // maskB: saturation(pixelHsv) > satBoost
  const hsvChannels = new cv.MatVector();
  cv.split(hsv, hsvChannels);
  const hChannel = hsvChannels.get(0);
  const satChannel = hsvChannels.get(1);
  const vChannel = hsvChannels.get(2);
  hChannel.delete();
  vChannel.delete();
  const maskB = new cv.Mat();
  cv.threshold(satChannel, maskB, satBoost, 255, cv.THRESH_BINARY);
  satChannel.delete();
  hsvChannels.delete();

  const mask = new cv.Mat();
  cv.bitwise_or(maskA, maskB, mask);
  maskA.delete();
  maskB.delete();
  return mask;
}

function removeTNutHoles(cv: CV, mask: Mat, minAreaPx: number): void {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  // opencv.js's compiled binding requires the trailing offset arg despite the .d.ts marking
  // it optional — omitting it throws "invalid number of arguments" at the embind layer.
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE, new cv.Point(0, 0));

  const width = mask.cols;
  const maskData = mask.data as Uint8Array;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    const perimeter = cv.arcLength(contour, true);
    if (isBoltHole(area, perimeter, minAreaPx)) {
      // Rasterize removal ourselves (rather than cv.drawContours) so it's just our own
      // well-understood point-in-polygon test, not another opencv.js overload to fight.
      const rect = cv.boundingRect(contour);
      const points: Point[] = [];
      const contourData = contour.data32S as Int32Array;
      for (let p = 0; p < contourData.length; p += 2) {
        points.push([contourData[p], contourData[p + 1]]);
      }
      for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
          if (pointInPolygon([x + 0.5, y + 0.5], points)) {
            maskData[y * width + x] = 0;
          }
        }
      }
    }
    contour.delete();
  }
  contours.delete();
  hierarchy.delete();
}

function applyMorphology(cv: CV, mask: Mat): void {
  const openKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, openKernel);
  openKernel.delete();

  const closeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);
  closeKernel.delete();
}

function extractCandidates(cv: CV, mask: Mat, params: DetectionParams, imageArea: number): Candidate[] {
  const width = mask.cols;
  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  const numLabels = cv.connectedComponentsWithStats(mask, labels, stats, centroids, 8, cv.CV_32S);
  centroids.delete();

  const statsData = stats.data32S as Int32Array;
  const labelsData = labels.data32S as Int32Array;
  const candidates: Candidate[] = [];

  for (let label = 1; label < numLabels; label++) {
    const x = statsData[label * 5 + 0];
    const y = statsData[label * 5 + 1];
    const w = statsData[label * 5 + 2];
    const h = statsData[label * 5 + 3];
    const area = statsData[label * 5 + 4];

    if (!passesHoldFilters({ area, width: w, height: h }, params, imageArea)) continue;

    const compMask = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(0));
    const compData = compMask.data as Uint8Array;
    for (let ry = 0; ry < h; ry++) {
      const srcRowStart = (y + ry) * width + x;
      const dstRowStart = ry * w;
      for (let rx = 0; rx < w; rx++) {
        if (labelsData[srcRowStart + rx] === label) compData[dstRowStart + rx] = 255;
      }
    }
    candidates.push({ mask: compMask, offsetX: x, offsetY: y, area });
  }

  labels.delete();
  stats.delete();
  return candidates;
}

function splitTouchingCandidates(cv: CV, candidates: Candidate[]): Candidate[] {
  const medianArea = median(candidates.map((c) => c.area));
  const result: Candidate[] = [];
  for (const candidate of candidates) {
    if (candidate.area > medianArea * WATERSHED_SPLIT_AREA_MULTIPLIER) {
      const split = splitViaWatershed(cv, candidate);
      if (split.length > 1) {
        result.push(...split);
        candidate.mask.delete();
        continue;
      }
    }
    result.push(candidate);
  }
  return result;
}

/** Standard distance-transform + watershed recipe for separating touching blobs. */
function splitViaWatershed(cv: CV, candidate: Candidate): Candidate[] {
  const { mask, offsetX, offsetY } = candidate;
  const w = mask.cols;
  const h = mask.rows;

  const dist = new cv.Mat();
  cv.distanceTransform(mask, dist, cv.DIST_L2, 5);
  const distData = dist.data32F as Float32Array;
  let maxVal = 0;
  for (let i = 0; i < distData.length; i++) if (distData[i] > maxVal) maxVal = distData[i];

  const sureFg = new cv.Mat();
  cv.threshold(dist, sureFg, 0.5 * maxVal, 255, cv.THRESH_BINARY);
  dist.delete();
  const sureFg8u = new cv.Mat();
  sureFg.convertTo(sureFg8u, cv.CV_8U);
  sureFg.delete();

  const markers = new cv.Mat();
  const numMarkers = cv.connectedComponents(sureFg8u, markers, 8, cv.CV_32S);
  sureFg8u.delete();

  if (numMarkers <= 2) {
    markers.delete();
    return [candidate];
  }

  const markersData = markers.data32S as Int32Array;
  const maskData = mask.data as Uint8Array;
  for (let i = 0; i < markersData.length; i++) {
    if (maskData[i] === 0) markersData[i] = 1; // sure background
    else if (markersData[i] > 0) markersData[i] += 1; // shift seed labels away from background=1
    // else: foreground but not a sure-fg seed -> leave at 0 ("unknown", watershed fills it in)
  }

  const rgbDummy = new cv.Mat(h, w, cv.CV_8UC3);
  const clones = [mask.clone(), mask.clone(), mask.clone()];
  const channelVec = new cv.MatVector();
  for (const c of clones) channelVec.push_back(c);
  cv.merge(channelVec, rgbDummy);
  channelVec.delete();
  for (const c of clones) c.delete();

  cv.watershed(rgbDummy, markers);
  rgbDummy.delete();

  const regionIds = new Set<number>();
  for (let i = 0; i < markersData.length; i++) if (markersData[i] >= 2) regionIds.add(markersData[i]);

  if (regionIds.size < 2) {
    markers.delete();
    return [candidate];
  }

  const results: Candidate[] = [];
  for (const id of regionIds) {
    const regionMask = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(0));
    const regionData = regionMask.data as Uint8Array;
    let area = 0;
    for (let i = 0; i < markersData.length; i++) {
      if (markersData[i] === id) {
        regionData[i] = 255;
        area++;
      }
    }
    if (area < 4) {
      regionMask.delete();
      continue;
    }
    results.push({ mask: regionMask, offsetX, offsetY, area });
  }
  markers.delete();

  if (results.length < 2) {
    for (const r of results) r.mask.delete();
    return [candidate];
  }
  return results;
}

function extractGeometry(cv: CV, candidate: Candidate, lab: Mat): DetectRawHold {
  const { mask, offsetX, offsetY, area } = candidate;

  // The 5-arg (no hierarchy) findContours overload the .d.ts documents doesn't match what's
  // actually registered in this build — RETR_EXTERNAL (0) lands in a Mat-typed slot and
  // throws "Cannot pass 0 as a Mat". The 6-arg form works, so always pass a hierarchy output
  // even where (as here) it's unused.
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE, new cv.Point(0, 0));
  hierarchy.delete();

  let bestIdx = -1;
  let bestArea = -1;
  for (let i = 0; i < contours.size(); i++) {
    const a = cv.contourArea(contours.get(i));
    if (a > bestArea) {
      bestArea = a;
      bestIdx = i;
    }
  }

  let polygon: Point[];
  let centroid: Point;

  if (bestIdx === -1) {
    // Shouldn't happen for a non-empty mask, but stay crash-proof.
    polygon = [
      [offsetX, offsetY],
      [offsetX + mask.cols, offsetY],
      [offsetX + mask.cols, offsetY + mask.rows],
      [offsetX, offsetY + mask.rows],
    ];
    centroid = [offsetX + mask.cols / 2, offsetY + mask.rows / 2];
  } else {
    const contour = contours.get(bestIdx);
    const perimeter = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, Math.max(1, 0.012 * perimeter), true);

    polygon = [];
    const approxData = approx.data32S as Int32Array;
    for (let i = 0; i < approxData.length; i += 2) {
      polygon.push([approxData[i] + offsetX, approxData[i + 1] + offsetY]);
    }
    approx.delete();

    const m = cv.moments(contour, false) as { m00: number; m10: number; m01: number };
    centroid =
      m.m00 > 0
        ? [m.m10 / m.m00 + offsetX, m.m01 / m.m00 + offsetY]
        : [offsetX + mask.cols / 2, offsetY + mask.rows / 2];
    contour.delete();
  }
  contours.delete();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bbox: [number, number, number, number] = [minX, minY, maxX - minX, maxY - minY];

  const roiMat = lab.roi(new cv.Rect(offsetX, offsetY, mask.cols, mask.rows));
  const meanScalar = cv.mean(roiMat, mask);
  roiMat.delete();

  return {
    polygon,
    centroid,
    bbox,
    areaPx: area,
    meanColorLab: [meanScalar[0], meanScalar[1], meanScalar[2]],
  };
}
