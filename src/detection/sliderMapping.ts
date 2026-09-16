/** §6 tuning UI mappings: sliders are 0-100, params have their own native ranges/directions. */

const BG_DELTA_E_MIN = 4;
const BG_DELTA_E_MAX = 30;

const MIN_AREA_FRAC_MIN = 0.00002;
const MIN_AREA_FRAC_MAX = 0.0005;

/** Higher sensitivity -> lower bgDeltaE (spec: "inverted: higher sensitivity = lower threshold"). */
export function sensitivityToBgDeltaE(sensitivity: number): number {
  const t = sensitivity / 100;
  return Math.round(BG_DELTA_E_MAX - t * (BG_DELTA_E_MAX - BG_DELTA_E_MIN));
}

export function bgDeltaEToSensitivity(bgDeltaE: number): number {
  const t = (BG_DELTA_E_MAX - bgDeltaE) / (BG_DELTA_E_MAX - BG_DELTA_E_MIN);
  return Math.round(Math.min(100, Math.max(0, t * 100)));
}

export function sliderToMinAreaFrac(slider: number): number {
  const t = slider / 100;
  return MIN_AREA_FRAC_MIN + t * (MIN_AREA_FRAC_MAX - MIN_AREA_FRAC_MIN);
}

export function minAreaFracToSlider(minAreaFrac: number): number {
  const t = (minAreaFrac - MIN_AREA_FRAC_MIN) / (MIN_AREA_FRAC_MAX - MIN_AREA_FRAC_MIN);
  return Math.round(Math.min(100, Math.max(0, t * 100)));
}
