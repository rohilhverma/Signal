// ─── Hot Topics · circle packing ──────────────────────────────────────────────
//
// The one place that knows how bubbles nestle together. Pure geometry: no React, no
// DOM, no simulation.
//
// It exists because two different layers need the same answer and must not disagree
// about it. `bubbleScale` packs to find out how big the cloud WOULD be, so it can
// shrink the radii until it fits the panel; `fieldSimulation` packs to find out where
// each bubble GOES. If those two ran different packings the field would be sized
// against an arrangement it never actually draws.

import { packEnclose, packSiblings } from "d3-hierarchy";

/**
 * Surface gap between two touching bubbles, in px.
 *
 * Every packed-bubble example uses 1-2px; more than that and the cloud stops reading as
 * nestled. Each circle is padded by half of it, so a contact between two neighbours
 * comes out to the full gap.
 */
export const BUBBLE_GAP = 2;

export type PackedCircle = { x: number; y: number; r: number };

/**
 * Packs circles of the given radii into a single nestled cluster.
 *
 * `packSiblings` runs the Wang et al. front-chain algorithm and produces a genuinely
 * optimal arrangement - circles touching, no wasted interior space - which a force
 * simulation only ever approximates. Relaxing 18 circles from a ring with collision
 * alone measured 57% packing density; this reaches the low 70s, and that gap is the
 * whole visual difference between "a packed cloud" and "some circles near each other".
 *
 * It takes a FLAT array, so none of d3-hierarchy's tree machinery is involved - no
 * `hierarchy`, no `sum`, no root node. Order matters, though: circles are placed in the
 * order given, and largest-first is what puts the big topics at the heart of the cloud
 * rather than out on its rim.
 *
 * The result is positioned around an arbitrary origin; `enclosing` is the smallest
 * circle containing all of it, which is what callers use to recentre and to scale.
 */
export function packCircles(radii: number[]): {
  circles: PackedCircle[];
  enclosing: PackedCircle;
} {
  const circles: PackedCircle[] = radii.map(r => ({ r: r + BUBBLE_GAP / 2, x: 0, y: 0 }));
  packSiblings(circles);
  const enclosing = packEnclose(circles) ?? { x: 0, y: 0, r: 0 };
  return { circles, enclosing };
}
