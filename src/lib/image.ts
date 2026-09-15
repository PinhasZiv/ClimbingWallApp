/**
 * Decode a photo and produce a normalised, downscaled copy.
 *
 * `imageOrientation: 'from-image'` makes createImageBitmap bake in the EXIF
 * orientation tag itself, so callers never have to hand-parse EXIF bytes or
 * think about orientation again — this is the classic source of sideways
 * photos the spec warns about. Supported on Chrome/Chromium (our Android
 * target) since Chrome 81; explicitly requested here rather than relied on
 * as a default, since defaults have varied across versions.
 */
export interface NormalizedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export async function normalizeAndDownscale(
  source: Blob,
  maxLongEdge: number,
  quality = 0.9,
): Promise<NormalizedPhoto> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('canvas.toBlob failed'))),
        'image/jpeg',
        quality,
      );
    });

    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
