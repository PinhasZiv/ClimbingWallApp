import type { DetectionParams } from '../types/models';
import type { DetectRawHold } from './pipeline';
import type { WorkerResponse } from './messages';

export type DetectionProgressHandler = (stage: string) => void;

/**
 * Owns the (lazily-created, reused) detection Web Worker. OpenCV.js is only pulled into the
 * worker's bundle when this module is first imported, and only actually loaded/initialized
 * inside the worker on the first detect() call — the spec's "loaded lazily... do not block
 * first paint" applies to the whole app shell, not just the main thread.
 */
class DetectionClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/detectionWorker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  detect(
    imageData: ImageData,
    params: DetectionParams,
    wallLabOverride: [number, number, number] | null,
    onProgress?: DetectionProgressHandler,
  ): Promise<{ holds: DetectRawHold[]; wallLabUsed: [number, number, number]; elapsedMs: number }> {
    const worker = this.ensureWorker();
    const requestId = this.nextRequestId++;

    return new Promise((resolve, reject) => {
      function cleanup() {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleWorkerError);
      }
      function handleMessage(event: MessageEvent<WorkerResponse>) {
        const msg = event.data;
        if (msg.requestId !== requestId) return;
        if (msg.type === 'progress') {
          onProgress?.(msg.stage);
        } else if (msg.type === 'result') {
          cleanup();
          resolve({ holds: msg.holds, wallLabUsed: msg.wallLabUsed, elapsedMs: msg.elapsedMs });
        } else if (msg.type === 'error') {
          cleanup();
          reject(new Error(msg.message));
        }
      }
      // A synchronous failure inside the worker (a bundling/load error, not a pipeline
      // exception — those are caught and posted as {type:'error'}) fires here instead of
      // ever posting a message back, which would otherwise hang this promise forever.
      function handleWorkerError(event: ErrorEvent) {
        cleanup();
        reject(new Error(event.message || 'Detection worker failed to load'));
      }
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleWorkerError);
      worker.postMessage({ type: 'detect', requestId, imageData, params, wallLabOverride });
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}

export const detectionClient = new DetectionClient();
