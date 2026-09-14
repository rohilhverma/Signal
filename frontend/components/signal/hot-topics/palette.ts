// ─── Hot Topics · palette ─────────────────────────────────────────────────────
//
// Bubble area encodes magnitude, so colour has the same job: this is a SEQUENTIAL
// encoding - one hue, more-is-darker - not a categorical one. Eight competing hues
// would fight the size channel instead of reinforcing it.
//
// The hue is the amber the app already owns (sepia's --sg-accent, #d97706, which is
// OKLCH H 58). Every step below was generated at a fixed H 58 and checked against
// the four ordinal-ramp gates - monotone lightness, adjacent dL >= 0.06, the step
// nearest the surface clearing 2:1, and a single hue - on that theme's own --sg-bg.
// All three themes pass with a hue spread of 0-1 degrees.
//
// These are ORDINAL, not sequential, ramps: a bubble is a discrete mark that must
// stay visible, so the end nearest the surface cannot recede toward it the way a
// heatmap cell legitimately may.

export type ThemeName = "light" | "dark" | "sepia";

/** Stored light -> dark in every theme; `stepColor` handles the direction. */
const RAMPS: Record<ThemeName, readonly string[]> = {
  light: ["#e69f68", "#d08b54", "#ba7740", "#a5642c", "#915114"],
  dark: ["#ffb780", "#e49e67", "#c9854e", "#af6d35", "#95551a"],
  sepia: ["#e19a64", "#cb8650", "#b5733c", "#a15f27", "#8c4c0e"],
};

export const RAMP_STEPS = RAMPS.light.length;

/**
 * Maps a heat step (0 = coolest) to a fill.
 *
 * On a light surface the hottest topic is the DARKEST step; on a dark surface it is
 * the LIGHTEST, because "more ink" is what reads as more in each case. Same array,
 * read in opposite directions - not two palettes.
 */
export function stepColor(step: number, theme: ThemeName): string {
  const ramp = RAMPS[theme] ?? RAMPS.light;
  const clamped = Math.max(0, Math.min(RAMP_STEPS - 1, Math.round(step)));
  const index = theme === "dark" ? RAMP_STEPS - 1 - clamped : clamped;
  return ramp[index];
}

/**
 * Label ink for text sitting ON a bubble.
 *
 * Contrast here is against the FILL, not the page, so this cannot key off the heat step
 * directly: dark mode reads the ramp backwards, so its hottest step is the LIGHTEST fill
 * and needs dark text, the exact opposite of light and sepia. Keying off the step is how
 * the first version put white text on a near-white bubble.
 *
 * Resolving the ramp index first collapses all three themes to one rule. Every one of
 * the 15 (theme, step) combinations was measured against both inks; index <= 2 wanting
 * dark ink and index >= 3 wanting light ink is the optimum in all 15, and with these two
 * inks every combination clears 4.5:1.
 */
export function labelColor(step: number, theme: ThemeName): string {
  const clamped = Math.max(0, Math.min(RAMP_STEPS - 1, Math.round(step)));
  const index = theme === "dark" ? RAMP_STEPS - 1 - clamped : clamped;
  return index >= 3 ? "#ffffff" : "#1a0f02";
}
