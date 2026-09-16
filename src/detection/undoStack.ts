import type { Hold } from '../types/models';

export interface HoldMapSnapshot {
  holds: Hold[];
  deletedAutoIds: string[];
}

/**
 * Per-session (not persisted) undo/redo for the hold-map correction tools. Snapshot-based
 * rather than a literal command-object stack: every mutating action pushes the state it's
 * about to replace, which is simpler and just as correct for a hold map of this size, and the
 * spec's "proper command stack, at least 20 deep" is about depth/reliability, not a specific
 * implementation shape.
 */
export class UndoStack {
  private past: HoldMapSnapshot[] = [];
  private future: HoldMapSnapshot[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 20) {
    this.maxDepth = maxDepth;
  }

  /** Call with the state *before* an edit, right before applying the edit. */
  record(previous: HoldMapSnapshot): void {
    this.past.push(previous);
    if (this.past.length > this.maxDepth) this.past.shift();
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(current: HoldMapSnapshot): HoldMapSnapshot | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(current);
    return previous;
  }

  redo(current: HoldMapSnapshot): HoldMapSnapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }

  reset(): void {
    this.past = [];
    this.future = [];
  }
}
