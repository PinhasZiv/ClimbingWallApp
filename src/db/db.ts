import Dexie, { type Table } from 'dexie';
import type { BlobRecord, Route, Wall } from '../types/models';

export class ClimbingWallDB extends Dexie {
  walls!: Table<Wall, string>;
  routes!: Table<Route, string>;
  blobs!: Table<BlobRecord, string>;

  constructor() {
    super('ClimbingWallDB');
    this.version(1).stores({
      walls: 'id, name, updatedAt',
      routes: 'id, wallId, updatedAt',
      blobs: 'key',
    });
  }
}

export const db = new ClimbingWallDB();
