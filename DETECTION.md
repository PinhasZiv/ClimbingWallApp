# Hold detection

How the automatic hold detector works, what each tuning parameter controls, where it's likely
to fail, and where a trained model would slot in for v2.

## Pipeline (`src/detection/pipeline.ts`, run inside `src/workers/detectionWorker.ts`)

Runs entirely in a Web Worker on a copy of the photo downscaled to a 1200px longest edge
(`DETECTION_MAX_EDGE`); results are scaled back up to the canonical 2000px photo's coordinate
space by the caller (`src/detection/toHolds.ts`) before being stored.

1. **Colour space conversion.** RGBA → RGB → CIELAB (`cv.COLOR_RGB2Lab`) and RGB → HSV. OpenCV's
   8-bit Lab encoding is used throughout (L scaled to 0–255, a/b offset by 128) — not "true" Lab
   — since it's cheap, stable, and the deltaE math below only needs internally-consistent
   distances, not colorimetric accuracy.
2. **Background (wall colour) sampling.** Grid-samples the Lab image, buckets samples into a
   coarse histogram (8 bins per channel), and takes the mode bucket's average as the wall
   colour. A user-picked override (1–3 tapped points, averaged) replaces this when set.
3. **Candidate mask.** `maskA` = per-pixel Lab distance from the wall colour exceeds `bgDeltaE`
   (a plain typed-array loop, not an OpenCV Mat/Scalar op — see "opencv.js quirks" below).
   `maskB` = HSV saturation exceeds `satBoost`. `mask = maskA OR maskB`.
4. **T-nut hole removal.** Contours below `minAreaFrac` with circularity
   (`4π·area/perimeter²`) above 0.7 are rasterized out of the mask using our own
   point-in-polygon test over the contour's bounding box (see below for why not
   `cv.drawContours`).
5. **Morphology.** `MORPH_OPEN` (3×3 ellipse) then `MORPH_CLOSE` (5×5 ellipse).
6. **Connected components + filter.** `connectedComponentsWithStats`, then each component is
   checked against `minAreaFrac`/`maxAreaFrac`/`minFillRatio`/`maxAspect`
   (`src/detection/filters.ts` — pure, unit-tested predicates).
7. **Split touching holds.** For components over 2.5× the median surviving area: distance
   transform → threshold at 50% of the local max → connected components as watershed seeds →
   `cv.watershed` on a 3-channel copy of the binary mask (the standard "split touching blobs"
   recipe; the "image" argument only needs to carry the mask's shape here, not real color/texture
   information, since the seeds already encode where each hold's peak is).
8. **Geometry extraction.** `findContours` per surviving region, `approxPolyDP` at
   `epsilon = 0.012 × perimeter`, centroid via image moments, mean Lab colour via
   `cv.mean` over the region's mask.
9. **Stable ordering.** Holds are bucketed into rows by y-proximity (relative to median hold
   height) and sorted left-to-right within each row (`sortHoldsRowMajor`), then assigned
   deterministic ids from a coarse grid-snap of their centroid (`autoHoldId`) — re-running
   detection with the same/similar params reproduces the same ids for the same physical holds,
   which is what makes preserving manual deletions across re-runs possible (see below).

### Parameters (`DetectionParams`)

| Param | Default | What it controls |
|---|---|---|
| `bgDeltaE` | 12 | How different from the wall colour a pixel must be to count as "hold". Lower = more sensitive (catches subtle holds, also more noise). Exposed inverted as the "Sensitivity" slider. |
| `satBoost` | 60 | HSV saturation above which a pixel counts as a hold regardless of Lab distance — catches saturated holds sitting in shadow. |
| `minAreaFrac` | 0.00008 | Minimum component area, as a fraction of image area. Also the T-nut-hole size cutoff. Exposed as "Minimum hold size". |
| `maxAreaFrac` | 0.02 | Maximum component area — rejects large uniform regions (floor, ceiling, a big shadow). |
| `minFillRatio` | 0.30 | `area / bboxArea`. Rejects sparse/linear things like wall seams. |
| `maxAspect` | 5.0 | `longSide / shortSide`. Rejects thin slivers. |
| `splitTouching` | true | Whether to run the watershed split step at all. |

### What makes it fail

- **Uneven lighting / harsh shadows** shift the wall's apparent colour across the photo, so a
  single global `wallLab` under- or over-triggers in different regions. The capture guidance
  screen exists specifically to reduce this; the "Pick wall colour" override helps for a
  single bad photo but doesn't fix per-region lighting gradients.
- **Holds that closely match the wall colour** (e.g. a white hold on a white/cream wall) rely
  entirely on the saturation channel or a tight `bgDeltaE`; very low-contrast holds can be
  missed. Lowering the sensitivity slider (raising `bgDeltaE`'s inverse) trades this against
  more false positives elsewhere.
- **Densely packed/touching holds** depend on the watershed step finding a distinct local
  distance-transform peak per hold; holds of very unequal size touching each other, or more
  than ~3 holds fused into one blob, can still under-split.
- **T-nut hole removal is purely geometric** (small + round). A small round hold color-matched
  to the wall could theoretically be removed as a "bolt hole" — in practice holds are larger
  and less perfectly circular than bolt holes, but it's a real edge case at aggressive
  `minAreaFrac` settings.
- **Deterministic-id re-run matching is centroid-based, not real tracking.** A parameter change
  that shifts a hold's centroid past the id grid's snap distance "forgets" that hold was
  manually deleted, and it reappears after the next re-run. This is a known, accepted tradeoff
  (see `src/detection/mergeResults.ts`) rather than a bug — the alternative is real per-run
  object correspondence, which is out of scope for a classical pipeline.

### opencv.js quirks worth knowing before touching this code

This build (`@techstark/opencv-js`, the official `docs.opencv.org` 5.0.0 build repackaged for
npm) has several functions whose actual compiled (embind) arity doesn't match what their
TypeScript declarations claim is optional:

- `findContours`'s trailing `offset` parameter is **not** optional at runtime — the "5-arg, no
  hierarchy" overload the `.d.ts` documents doesn't exist as such; a call missing the offset
  throws `Cannot pass "0" as a Mat` (the missing arg's slot gets filled by the next positional
  value, which is often a small enum like `RETR_EXTERNAL` = 0, and that value lands in what
  turns out to be a Mat-typed parameter). The fix used throughout this codebase: always call
  the 6-arg `(image, contours, hierarchy, mode, method, offset)` form, even where the hierarchy
  output is unused, and always pass an explicit `offset` (`new cv.Point(0, 0)`).
- `drawContours` hit the same class of arity issue, so the T-nut hole removal step avoids it
  entirely and rasterizes contour removal itself with a plain point-in-polygon test
  (`src/lib/geometry.ts`'s `pointInPolygon`) over the contour's `cv.boundingRect` — no less
  correct, and one fewer opencv.js overload to fight.
- If you add a new opencv.js call with "optional" trailing arguments, verify it with a real
  detection run before trusting the `.d.ts`; an "invalid number of arguments" error means the
  arity genuinely doesn't match, while a "Cannot pass X as a Y" error usually means a missing
  argument shifted everything after it by one position.

## Manual correction tools (`src/screens/DetectionTuning.tsx`)

Every `Hold` carries `source: 'auto' | 'manual'`. A four-mode toolbar (Add/Delete/Merge/Split)
plus Undo/Redo:

- **Add.** Tapping bare wall runs `src/lib/floodFill.ts`'s `floodFillHold`: a coarse-grid
  (4px) flood fill from the tap point, bounded by the same "not wall colour" deltaE test the
  detector uses, capped at 2% of image area so a fill that "runs away" (a busy, low-contrast
  photo with no clean edge near the tap) aborts rather than consuming the whole photo. The
  filled region's convex hull becomes the hold's polygon. Falls back to a fixed-radius circle
  (`makeCirclePolygon`) when the tap landed on wall-colored pixels or the fill was rejected.
  Reuses whatever wall colour the last detection run actually used
  (`ResultMessage.wallLabUsed`), so it stays consistent with the current sensitivity setting
  without recomputing it.
- **Delete.** Tap a hold to remove it; drag across the photo to remove every hold the path
  crosses in one gesture (`PhotoStage`'s `dragMode`/`onDragEnd`).
- **Merge.** Tap two holds in sequence (the first is highlighted while waiting for the
  second); the result is the convex hull of both polygons combined (`convexHull` in
  `src/lib/geometry.ts`), per spec.
- **Split.** Draw a line across a hold; `splitPolygonByLine` (Sutherland-Hodgman-style
  half-plane clipping) cuts its polygon into two along that line's infinite extension. Only
  holds whose bbox overlaps the drawn path are considered, so an unlucky line alignment can't
  split an unrelated hold elsewhere on the wall.

Any tool that consumes an auto-detected hold (delete, merge, split) records its id in
`Wall.deletedAutoIds` so a future re-run doesn't bring it back
(`src/detection/mergeResults.ts`'s `mergeAutoHolds`) — merge/split's *output* holds are always
`source: 'manual'`, since they no longer reflect what the detector actually produced.

**Undo/redo** (`src/detection/undoStack.ts`) is a 20-deep snapshot stack of
`{holds, deletedAutoIds}`, recorded before every mutating action (including a re-run, so a bad
parameter change is undoable too) — not a literal command-object stack, since a snapshot is
simpler and just as correct at this data size.

## Where a trained model would slot in (v2)

The pipeline is a single pure function, `runDetectionPipeline(cv, imageData, params,
wallLabOverride, onProgress) -> DetectRawHold[]`, called from one place
(`detectionWorker.ts`'s message handler). A learned instance-segmentation model would
implement the same signature (swap the `cv`-based internals for a model inference call,
same `ImageData` in / `DetectRawHold[]` out contract) and could be selected behind a
`HoldDetector` interface without touching the worker protocol, the merge/dedup logic, or any
UI code.
