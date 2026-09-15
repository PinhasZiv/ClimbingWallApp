import { describe, expect, it } from 'vitest';
import { nextRole } from './roleCycle';

describe('nextRole', () => {
  it('cycles unused -> start -> hand -> foot -> finish -> unused', () => {
    expect(nextRole('unused')).toBe('start');
    expect(nextRole('start')).toBe('hand');
    expect(nextRole('hand')).toBe('foot');
    expect(nextRole('foot')).toBe('finish');
    expect(nextRole('finish')).toBe('unused');
  });
});
