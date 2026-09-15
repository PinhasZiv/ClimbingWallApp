const CAPTURE_HINT_DISMISSED_KEY = 'captureHintDismissed';

export function isCaptureHintDismissed(): boolean {
  try {
    return localStorage.getItem(CAPTURE_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissCaptureHint(): void {
  try {
    localStorage.setItem(CAPTURE_HINT_DISMISSED_KEY, '1');
  } catch {
    // ignore — hint just reappears next time, not a functional problem
  }
}
