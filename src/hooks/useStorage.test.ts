import { describe, expect, it } from 'vitest';
import { formatBytes } from './useStorage';

describe('formatBytes', () => {
  it('formats bytes under 1KB as B', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats under 1MB as KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
  it('formats 1MB and above as MB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
