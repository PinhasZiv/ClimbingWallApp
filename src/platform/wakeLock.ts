/**
 * Thin adapter over screen wake lock. Web implementation today (Wake Lock API);
 * swap for @capacitor-community/keep-awake when wrapped with Capacitor.
 */
export interface WakeLockHandle {
  release: () => Promise<void>;
}

export async function acquireWakeLock(): Promise<WakeLockHandle | null> {
  if (!('wakeLock' in navigator)) return null;
  try {
    const sentinel = await (navigator as Navigator & {
      wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    }).wakeLock.request('screen');
    return { release: () => sentinel.release() };
  } catch {
    return null;
  }
}
