/** Longest edge, in px, of the canonical stored photo. All hold coordinates live in this space. */
export const CANONICAL_MAX_EDGE = 2000;

/** Longest edge, in px, of the downscaled copy detection runs against (M4). */
export const DETECTION_MAX_EDGE = 1200;

export const V_GRADES = Array.from({ length: 13 }, (_, i) => `V${i}`);

export const FONT_GRADES = [
  '4', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
];
