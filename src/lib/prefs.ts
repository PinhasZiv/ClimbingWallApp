import type { GradeSystem } from '../types/models';

const CAPTURE_HINT_DISMISSED_KEY = 'captureHintDismissed';
const GRADE_SYSTEM_KEY = 'gradeSystem';

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

export function getRememberedGradeSystem(): GradeSystem {
  try {
    return localStorage.getItem(GRADE_SYSTEM_KEY) === 'font' ? 'font' : 'v';
  } catch {
    return 'v';
  }
}

export function rememberGradeSystem(system: GradeSystem): void {
  try {
    localStorage.setItem(GRADE_SYSTEM_KEY, system);
  } catch {
    // ignore — falls back to default next time, not a functional problem
  }
}
