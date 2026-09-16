/**
 * Downscale the (already orientation-normalized, canonical) stored wall photo further, to run
 * detection against — per spec §5, detection runs on a longest-edge-1200px copy for speed.
 * Returns the scale factor to multiply detection-space coordinates by to land back in the
 * canonical photo's coordinate space.
 */
export interface DetectionImage {
  imageData: ImageData;
  scaleFactor: number;
}

export async function decodeForDetection(source: Blob, maxLongEdge: number): Promise<DetectionImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);

    return { imageData: ctx.getImageData(0, 0, width, height), scaleFactor: bitmap.width / width };
  } finally {
    bitmap.close();
  }
}
