/**
 * Thin adapter over camera / file access. Web implementation today (file input
 * with capture=environment); swap the body for @capacitor/camera when wrapped
 * with Capacitor, without touching any call site.
 */
export interface CapturedPhoto {
  blob: Blob;
}

export async function capturePhoto(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { blob: file } : null);
    };
    input.click();
  });
}

export async function pickPhotoFromGallery(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { blob: file } : null);
    };
    input.click();
  });
}
