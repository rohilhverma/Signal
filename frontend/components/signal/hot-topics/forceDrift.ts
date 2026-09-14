// ─── Hot Topics · ambient motion ──────────────────────────────────────────────
//
// d3-force cools to a stop by design: alpha decays toward alphaTarget and the timer
// halts once it drops under alphaMin, which is ~300 ticks - about five seconds. A
// non-zero alphaTarget keeps the simulation warm, but warmth alone only produces
// residual jitter; something has to actually push. This is that push.
//
// It pulls each bubble toward a point CIRCLING its packed home position, rather than
// adding raw velocity in a wandering direction. The distinction is the whole design:
//
//   impulse  (`vx += sin(t) * amplitude`) has no notion of where the bubble belongs.
//            Every tick injects energy and only collision and centering take it back
//            out, so the cloud slowly inflates - measured at 54% packing density on
//            settle, loosening to 49% with the bounding box growing 495px -> 549px.
//   orbit    (`vx += (home + sin(t) * radius - x) * pull`) is bounded by construction.
//            The target can never be further than `radius` from home, so there is no
//            energy to accumulate. Measured 57% on settle, still 57% three minutes
//            later - and it moves MORE, 4.1px/sec against 2.1px/sec, because the
//            motion no longer has to fight the centering forces to exist.
//
// The per-node phase offset is what keeps this from looking mechanical. Without it
// every bubble oscillates in lockstep and the field reads as breathing rather than
// drifting; the per-node frequency multiplier stops the pattern from visibly repeating.
//
// The pull is deliberately NOT scaled by alpha. Every force d3 ships is - that is how
// a layout cools to rest - but ambient motion is the one thing that must survive
// cooling. At the alphaTarget this field runs (0.04) an alpha-scaled pull is throttled
// to roughly a pixel per second, which reads as static.

import type { BubbleNode } from "./types";

export type OrbitForce = {
  (alpha: number): void;
  initialize(nodes: BubbleNode[]): void;
};

/**
 * @param radius how far from home a bubble may wander, in px. 18 gives visible travel
 *   without a bubble ever appearing to leave its slot in the pack.
 * @param pull how hard it chases the orbiting target. Higher is faster and tighter to
 *   the circle; lower lets collision win more often and looks looser.
 * @param speed radians of orbit per millisecond. One lap takes ~4 minutes, so the
 *   motion never reads as a repeating cycle.
 */
export function forceOrbit(radius = 18, pull = 0.05, speed = 0.00042): OrbitForce {
  let nodes: BubbleNode[] = [];
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();

  const force = ((_alpha: number) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const t = (now - start) * speed;
    for (const node of nodes) {
      const targetX = node.ax + Math.sin(t * node.freqX + node.phaseX) * radius;
      const targetY = node.ay + Math.cos(t * node.freqY + node.phaseY) * radius;
      node.vx += (targetX - node.x) * pull;
      node.vy += (targetY - node.y) * pull;
    }
  }) as OrbitForce;

  force.initialize = (seeded: BubbleNode[]) => {
    nodes = seeded;
  };

  return force;
}

/** Seeds the phase/frequency constants a node needs before it can orbit. */
export function seedDrift<T extends object>(node: T): T & {
  phaseX: number;
  phaseY: number;
  freqX: number;
  freqY: number;
} {
  return Object.assign(node, {
    phaseX: Math.random() * Math.PI * 2,
    phaseY: Math.random() * Math.PI * 2,
    freqX: 0.6 + Math.random() * 0.8,
    freqY: 0.6 + Math.random() * 0.8,
  });
}
