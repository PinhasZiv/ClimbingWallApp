import { describe, expect, it } from 'vitest';
import { UndoStack, type HoldMapSnapshot } from './undoStack';

function snap(n: number): HoldMapSnapshot {
  return { holds: [], deletedAutoIds: [`v${n}`] };
}

describe('UndoStack', () => {
  it('undo restores the previously recorded state and enables redo', () => {
    const stack = new UndoStack(20);
    stack.record(snap(0));
    const restored = stack.undo(snap(1));
    expect(restored).toEqual(snap(0));
    expect(stack.canRedo()).toBe(true);
  });

  it('redo restores the state that was current before the undo', () => {
    const stack = new UndoStack(20);
    stack.record(snap(0));
    stack.undo(snap(1));
    const redone = stack.redo(snap(0));
    expect(redone).toEqual(snap(1));
  });

  it('a new edit after undo clears the redo stack', () => {
    const stack = new UndoStack(20);
    stack.record(snap(0));
    stack.undo(snap(1));
    stack.record(snap(0)); // new edit, applied on top of the undone state
    expect(stack.canRedo()).toBe(false);
  });

  it('caps history at maxDepth, dropping the oldest entries', () => {
    const stack = new UndoStack(3);
    for (let i = 0; i < 5; i++) stack.record(snap(i));
    // only the last 3 recorded states (2,3,4) should still be reachable
    let current = snap(5);
    const seen: HoldMapSnapshot[] = [];
    while (stack.canUndo()) {
      current = stack.undo(current)!;
      seen.push(current);
    }
    expect(seen).toEqual([snap(4), snap(3), snap(2)]);
  });

  it('undo/redo round-trips at least 20 steps deep', () => {
    const stack = new UndoStack(20);
    let current = snap(0);
    for (let i = 1; i <= 20; i++) {
      stack.record(current);
      current = snap(i);
    }
    for (let i = 19; i >= 0; i--) {
      current = stack.undo(current)!;
      expect(current).toEqual(snap(i));
    }
    expect(stack.canUndo()).toBe(false);
  });

  it('undo/redo on an empty stack is a no-op', () => {
    const stack = new UndoStack(20);
    expect(stack.undo(snap(0))).toBeNull();
    expect(stack.redo(snap(0))).toBeNull();
  });
});
