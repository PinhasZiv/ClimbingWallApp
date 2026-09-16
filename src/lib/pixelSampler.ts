/** Loads a photo once and exposes synchronous RGB pixel sampling at canonical-image coordinates. */
export async function createPixelSampler(blob: Blob): Promise<(x: number, y: number) => [number, number, number]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return (x: number, y: number) => {
    const clampedX = Math.min(canvas.width - 1, Math.max(0, Math.round(x)));
    const clampedY = Math.min(canvas.height - 1, Math.max(0, Math.round(y)));
    const px = ctx.getImageData(clampedX, clampedY, 1, 1).data;
    return [px[0], px[1], px[2]];
  };
}
