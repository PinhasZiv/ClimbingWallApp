import type { DetectionParams } from '../types/models';
import type { DetectRawHold } from './pipeline';

export interface DetectRequest {
  type: 'detect';
  requestId: number;
  imageData: ImageData;
  params: DetectionParams;
  wallLabOverride: [number, number, number] | null;
}

export type WorkerRequest = DetectRequest;

export interface ProgressMessage {
  type: 'progress';
  requestId: number;
  stage: string;
}

export interface ResultMessage {
  type: 'result';
  requestId: number;
  holds: DetectRawHold[];
  wallLabUsed: [number, number, number];
  elapsedMs: number;
}

export interface ErrorMessage {
  type: 'error';
  requestId: number;
  message: string;
}

export type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;
