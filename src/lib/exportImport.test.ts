import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMAT_VERSION,
  parseExportPayload,
  planImport,
  serializeExportPayload,
  type ExportPayload,
  type ExportedWall,
} from './exportImport';
import type { Route } from '../types/models';

function makeWall(id: string): ExportedWall {
  return {
    id,
    name: `Wall ${id}`,
    photoWidth: 2000,
    photoHeight: 1000,
    holds: [],
    deletedAutoIds: [],
    detectionParams: {
      bgDeltaE: 12,
      satBoost: 60,
      minAreaFrac: 0.00008,
      maxAreaFrac: 0.02,
      minFillRatio: 0.3,
      maxAspect: 5,
      splitTouching: true,
    },
    createdAt: 1,
    updatedAt: 1,
    photoBase64: 'AAA=',
    photoMimeType: 'image/jpeg',
  };
}

function makeRoute(id: string, wallId: string): Route {
  return {
    id,
    wallId,
    name: `Route ${id}`,
    grade: null,
    gradeSystem: 'v',
    assignments: {},
    footRule: 'marked-only',
    notes: '',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('export/import round-trip', () => {
  it('a serialized payload parses back to an equivalent object', () => {
    const payload: ExportPayload = {
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: 12345,
      walls: [makeWall('w1')],
      routes: [makeRoute('r1', 'w1')],
    };
    const roundTripped = parseExportPayload(serializeExportPayload(payload));
    expect(roundTripped).toEqual(payload);
  });

  it('rejects a file that is not a recognised export', () => {
    expect(() => parseExportPayload(JSON.stringify({ foo: 'bar' }))).toThrow();
    expect(() => parseExportPayload(JSON.stringify({ formatVersion: 999, walls: [], routes: [] }))).toThrow();
  });
});

describe('planImport', () => {
  const payload: ExportPayload = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: 1,
    walls: [makeWall('existing-wall'), makeWall('new-wall')],
    routes: [makeRoute('existing-route', 'existing-wall'), makeRoute('new-route', 'new-wall')],
  };

  it('with "skip": keeps new items, skips ids that already exist locally', () => {
    const plan = planImport(payload, new Set(['existing-wall']), new Set(['existing-route']), 'skip');
    expect(plan.wallsToWrite.map((w) => w.id)).toEqual(['new-wall']);
    expect(plan.routesToWrite.map((r) => r.id)).toEqual(['new-route']);
    expect(plan.skippedWallIds).toEqual(['existing-wall']);
    expect(plan.skippedRouteIds).toEqual(['existing-route']);
  });

  it('with "overwrite": writes everything, skips nothing', () => {
    const plan = planImport(payload, new Set(['existing-wall']), new Set(['existing-route']), 'overwrite');
    expect(plan.wallsToWrite.map((w) => w.id)).toEqual(['existing-wall', 'new-wall']);
    expect(plan.routesToWrite.map((r) => r.id)).toEqual(['existing-route', 'new-route']);
    expect(plan.skippedWallIds).toEqual([]);
    expect(plan.skippedRouteIds).toEqual([]);
  });

  it('with no local overlap, both strategies behave identically', () => {
    const skip = planImport(payload, new Set(), new Set(), 'skip');
    const overwrite = planImport(payload, new Set(), new Set(), 'overwrite');
    expect(skip.wallsToWrite).toEqual(overwrite.wallsToWrite);
    expect(skip.routesToWrite).toEqual(overwrite.routesToWrite);
  });
});
