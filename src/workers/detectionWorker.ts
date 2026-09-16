import cvReadyPromise from '@techstark/opencv-js';
import type { CV } from '@techstark/opencv-js';
import { runDetectionPipeline } from '../detection/pipeline';
import type { WorkerRequest, WorkerResponse } from '../detection/messages';

let cvPromise: Promise<CV> | null = null;

function getCv(): Promise<CV> {
  if (!cvPromise) {
    cvPromise = Promise.resolve(cvReadyPromise as unknown as Promise<CV> | CV).then((cv) => cv);
  }
  return cvPromise;
}

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(message, transfer);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'detect') return;

  const start = performance.now();
  try {
    const cv = await getCv();
    post({ type: 'progress', requestId: msg.requestId, stage: 'loading OpenCV' });

    const { holds, wallLabUsed } = runDetectionPipeline(
      cv,
      msg.imageData,
      msg.params,
      msg.wallLabOverride,
      (stage) => post({ type: 'progress', requestId: msg.requestId, stage }),
    );

    post({
      type: 'result',
      requestId: msg.requestId,
      holds,
      wallLabUsed,
      elapsedMs: performance.now() - start,
    });
  } catch (err) {
    post({
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
