export type HoldRole = 'unused' | 'start' | 'hand' | 'foot' | 'finish';

/** Order the tap gesture cycles through. 'unused' is the implicit start/end. */
export const ROLE_CYCLE: HoldRole[] = ['unused', 'start', 'hand', 'foot', 'finish'];

export interface Hold {
  id: string; // stable uuid, never reused
  polygon: [number, number][]; // simplified contour, in IMAGE pixel coords of the stored photo
  centroid: [number, number];
  bbox: [number, number, number, number]; // x, y, w, h
  areaPx: number;
  meanColorLab: [number, number, number];
  source: 'auto' | 'manual'; // manual = user-added or user-edited
}

export interface DetectionParams {
  bgDeltaE: number; // default 12
  satBoost: number; // default 60
  minAreaFrac: number; // default 0.00008
  maxAreaFrac: number; // default 0.02
  minFillRatio: number; // default 0.30
  maxAspect: number; // default 5.0
  splitTouching: boolean; // default true
}

export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  bgDeltaE: 12,
  satBoost: 60,
  minAreaFrac: 0.00008,
  maxAreaFrac: 0.02,
  minFillRatio: 0.3,
  maxAspect: 5.0,
  splitTouching: true,
};

export interface Wall {
  id: string;
  name: string; // e.g. "Main board — left panel"
  photoBlobKey: string; // key into the blob store
  photoWidth: number; // pixel dims of the STORED (possibly downscaled) photo
  photoHeight: number;
  holds: Hold[];
  /** Auto-detected hold ids the user explicitly deleted; preserved across re-detection. */
  deletedAutoIds: string[];
  detectionParams: DetectionParams; // what produced this map, so it can be re-run/tweaked
  createdAt: number;
  updatedAt: number;
}

export type GradeSystem = 'v' | 'font';

export type FootRule = 'marked-only' | 'any-hold' | 'feet-follow-hands';

export interface Route {
  id: string;
  wallId: string;
  name: string;
  grade: string | null; // free text, but the picker offers V0–V12 and Font 4–7C+
  gradeSystem: GradeSystem;
  assignments: Record<string /* holdId */, HoldRole>; // only non-'unused' entries stored
  footRule: FootRule;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface BlobRecord {
  key: string;
  blob: Blob;
}
