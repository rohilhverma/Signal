// ─── Hot Topics · scale ───────────────────────────────────────────────────────
//
// HotTopic[] -> BubbleDatum[]. Pure; no React, no DOM.

import { RAMP_STEPS } from "./palette";
import { packCircles } from "./packing";
import type { BubbleDatum, HotTopic } from "./types";

/** Below this radius no label fits, so the bubble carries tooltip + aria-label only. */
export const LABEL_MIN_RADIUS = 18;
/** Below this a bubble stops reading as a distinct object at all. */
const R_MIN = 15;
// Sized so the settled cloud fills the panel rather than floating in the middle of it.
// At 74 the field used barely a third of the available area and small labels truncated
// to "Micro..."; the cap in radiusBounds still protects narrow viewports.
const R_MAX = 96;

/**
 * Area - not radius - is proportional to value.
 *
 * Area = pi*r^2, so mapping value straight to radius makes a doubled value look four
 * times bigger. r must go as sqrt(value), and crucially the scale is anchored at ZERO,
 * not at the smallest value present: r = rMax * sqrt(v / vMax).
 *
 * Anchoring at the minimum instead - `scaleSqrt().domain([lo, hi]).range([rMin, rMax])`,
 * which is the reflex - stretches whatever range happens to be present across the full
 * radius range, so a set of near-identical values renders as wildly different circles.
 * Measured on real data that turned a 1.19x spread in value into a 21x spread in area.
 * A magnitude encoding has a meaningful zero and has to use it.
 *
 * rMin is applied afterwards as a legibility clamp. It does break proportionality at
 * the very bottom, which is the accepted trade for bubbles that stay visible.
 */
export function makeRadiusScale(values: number[], rMin = R_MIN, rMax = R_MAX) {
  const hi = Math.max(...values);
  return (v: number): number => {
    if (!Number.isFinite(v) || hi <= 0) return rMin;
    return Math.max(rMin, rMax * Math.sqrt(Math.max(0, v) / hi));
  };
}

/**
 * The quantity the area encodes: how much the topic is actually being talked about.
 *
 * It has to be a real count with a real zero, because the area is proportional to it.
 * An earlier version returned `sourceIds.length * 100 + totalMentions` to fold in
 * cross-source breadth, which reads sensibly as a sort key but is not a magnitude -
 * the constant offset compressed every topic into a narrow band and made the areas
 * meaningless. Breadth still leads the SORT in computeHotTopics; it just cannot ride
 * along inside the number the geometry encodes.
 */
export function heatValue(topic: HotTopic): number {
  return topic.totalMentions;
}

/** Breathing room between the packed cloud and the panel edge, in px. */
const FIELD_MARGIN = 12;

/**
 * Caps the largest bubble against the container so one runaway topic cannot swallow a
 * narrow viewport, and keeps the smallest legible.
 */
export function radiusBounds(width: number, height: number): { rMin: number; rMax: number } {
  const shortest = Math.max(1, Math.min(width, height));
  return { rMin: R_MIN, rMax: Math.max(R_MIN + 6, Math.min(R_MAX, shortest / 3.6)) };
}

/**
 * Picks the largest radius scale whose bubbles actually FIT the panel.
 *
 * Capping the biggest bubble is not enough, because nothing about one bubble's size
 * says anything about the total. `r = rMax * sqrt(v / vMax)` is anchored at zero and
 * normalised by the LARGEST value, so how big the cloud comes out depends entirely on
 * how spread the values are:
 *
 *   - a long tail (63 down to 3) puts most topics far below vMax, so most bubbles are
 *     small and the cloud fits comfortably;
 *   - an EVEN spread (11 down to 6 - completely normal when the feed is small) puts
 *     every topic near vMax, so all 18 bubbles come out near rMax at once. Measured,
 *     that packed into a 634x738 cloud - taller than the 460px panel it had to fit -
 *     and once clamped it collapsed into 7 overlapping pairs, the worst by 11px.
 *
 * The fix is to ask the packing itself how big the cloud will be and shrink until it
 * fits. Two things make that exact rather than a guess:
 *
 *   1. A pack is round, not rectangular, so the constraint is the SHORTER panel
 *      dimension - a 900x460 panel fits a 460px cloud, not a 900px one. Budgeting
 *      against rectangle area is what got the previous version wrong on wide panels.
 *   2. `packSiblings` is scale-invariant: multiply every radius by k and the whole
 *      arrangement, enclosing circle included, scales by exactly k. So one trial pack
 *      gives the answer outright, with no search.
 *
 * Shrinking preserves every ratio between bubbles, so the encoding is untouched - the
 * field is just drawn smaller. The rMin legibility floor is deliberately NOT reapplied
 * afterwards, because re-clamping would break the proportionality this whole scale
 * exists to protect; below the floor the renderer drops labels and falls back to the
 * tooltip and the rank list.
 */
export function fitRadiusScale(
  values: number[],
  width: number,
  height: number,
): (v: number) => number {
  const { rMin, rMax } = radiusBounds(width, height);
  const scale = makeRadiusScale(values, rMin, rMax);

  const allowed = Math.min(width, height) / 2 - FIELD_MARGIN;
  const { enclosing } = packCircles(values.map(scale));
  if (!(enclosing.r > allowed) || allowed <= 0) return scale;

  const k = allowed / enclosing.r;
  return (v: number) => scale(v) * k;
}

export function toBubbleData(
  topics: HotTopic[],
  width: number,
  height: number,
): BubbleDatum[] {
  if (topics.length === 0) return [];

  const values = topics.map(heatValue);
  const radiusFor = fitRadiusScale(values, width, height);

  // Colour is a redundant encoding of the SAME magnitude the area carries, binned
  // across the ramp - deliberately not of rank. Colour has to follow the entity: if it
  // tracked rank, filtering the list would repaint every survivor even though none of
  // them changed.
  // Binned in sqrt-space, the same transform the radius uses, so colour and size stay
  // consistent with each other. Binning the raw values instead lets a single outlier
  // ("AI", at 63 mentions against a median of 9) push every other topic into the
  // bottom step and leave most of the ramp unused.
  const lo = Math.sqrt(Math.min(...values));
  const hi = Math.sqrt(Math.max(...values));
  const span = hi - lo;

  return topics.map((topic, rank) => ({
    id: topic.term,
    label: topic.term,
    value: values[rank],
    rank,
    radius: radiusFor(values[rank]),
    colorStep:
      span === 0
        ? RAMP_STEPS - 1
        : Math.round(((Math.sqrt(values[rank]) - lo) / span) * (RAMP_STEPS - 1)),
    topic,
  }));
}
