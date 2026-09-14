// ─── Hot Topics · field simulation ────────────────────────────────────────────
//
// The layout and the motion, with no React and no DOM. `useBubbleField` binds this to
// a component lifecycle and writes the results to SVG; everything about WHERE the
// bubbles sit and HOW they move lives here.
//
// Split out of the hook deliberately. While the tuning sat inside a `useEffect` the
// only way to answer "do the bubbles actually pack, or do they spread?" was to open a
// browser and squint. As a pure function it can be ticked headlessly and measured -
// overlaps, packing density, drift speed - which is how every constant below was set.
//
// The shape of the thing:
//
//   packHomes ............. optimal circle packing -> each bubble's home position
//   createFieldSimulation . forces that hold bubbles near home and off each other
//   forceOrbit (sibling) .. the ambient motion around home
//
// Packing and motion are separate on purpose. The pack decides what the field LOOKS
// like at rest; the simulation only has to defend that arrangement.

import {
  forceCollide,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import { forceOrbit, seedDrift } from "./forceDrift";
import { BUBBLE_GAP, packCircles } from "./packing";
import type { BubbleDatum, BubbleNode } from "./types";

/**
 * Every constant that governs the layout and the motion, in one object.
 *
 * The collide values are the d3 defaults for a reason - `strength(1)` and more
 * iterations are what every packed-bubble example uses, and anything less leaves
 * residual overlap slack that reads as a loose cloud. The motion values are the ones
 * that are deliberately unusual, because the examples optimise for converging fast and
 * this optimises for looking calm.
 */
export const FIELD_TUNING = {
  /**
   * Damping, applied to velocity every tick. d3's default is 0.4 and the bubble
   * examples use 0.2, both tuned for reaching rest quickly. This field never reaches
   * rest, so it wants the opposite: heavy damping is the difference between "floating"
   * and "twitching".
   */
  velocityDecay: 0.72,
  /**
   * Pull back toward the panel centre. Note this is one of the ALPHA-SCALED forces, so
   * its authority is really strength x alpha - at the alphaTarget below that is 0.002,
   * next to nothing. That is intentional: the pack already put every bubble where it
   * belongs and `forceOrbit` is what holds it there. This is only a slow correction for
   * a cloud that has been nudged off-centre, and turning it up merely fights the pack.
   */
  centerStrength: 0.05,
  /** Surface gap between two touching bubbles. Shared with the packing, not guessed. */
  collidePadding: BUBBLE_GAP,
  /** d3's default. Below 1 each pass leaves overlap unresolved and the pack loosens. */
  collideStrength: 1,
  /** Rigidity of the no-overlap constraint. Free at this node count. */
  collideIterations: 3,
  /** How far a bubble may wander from its packed home, in px. */
  orbitRadius: 18,
  /** How hard it chases that orbit. See forceOrbit for why this is not alpha-scaled. */
  orbitPull: 0.05,
  /** Non-zero so the simulation never cools to a full stop. */
  alphaTarget: 0.04,
} as const;

/**
 * Builds the simulation nodes, reusing the position of any bubble that was already on
 * screen under the same id.
 *
 * Carrying positions across a rebuild is what makes a filter change read as the field
 * adjusting rather than re-forming from scratch: the bubble starts where it was and
 * the orbit force walks it to its new home. Homes themselves are assigned by
 * `packHomes`; the values seeded here only keep the node well-formed until then.
 */
export function seedNodes(
  data: BubbleDatum[],
  previous: BubbleNode[] = [],
): BubbleNode[] {
  const priorById = new Map(previous.map(node => [node.id, node]));

  return data.map(datum => {
    const prior = priorById.get(datum.id);
    // NaN is d3's own "not yet positioned" sentinel - `simulation.nodes` only assigns
    // an initial position when x or y is NaN - so packHomes uses the same convention to
    // tell a brand new bubble from one that is already on screen.
    return seedDrift({
      ...datum,
      x: prior?.x ?? NaN,
      y: prior?.y ?? NaN,
      vx: 0,
      vy: 0,
      ax: NaN,
      ay: NaN,
    }) as BubbleNode;
  });
}

/**
 * Assigns every bubble its home: the position it holds in an optimal circle packing.
 *
 * The packing itself lives in `packing`, shared with `bubbleScale` so that the radii
 * were sized against exactly the arrangement drawn here.
 *
 * A bubble already on screen keeps its current position and only its home moves - the
 * orbit force then walks it there, so a filter change reads as the field rearranging
 * rather than snapping. New bubbles start at home instead of flying in from nowhere.
 */
export function packHomes(nodes: BubbleNode[], width: number, height: number): void {
  if (nodes.length === 0) return;

  const { circles, enclosing } = packCircles(nodes.map(node => node.radius));

  // The pack is laid out around an arbitrary origin, so recentre it on the panel.
  const dx = width / 2 - enclosing.x;
  const dy = height / 2 - enclosing.y;

  nodes.forEach((node, i) => {
    node.ax = circles[i].x + dx;
    node.ay = circles[i].y + dy;
    if (Number.isNaN(node.x) || Number.isNaN(node.y)) {
      node.x = node.ax;
      node.y = node.ay;
    }
  });
}

/** Drops every bubble straight onto its home. The reduced-motion layout. */
export function snapToHomes(nodes: BubbleNode[]): void {
  for (const node of nodes) {
    node.x = node.ax;
    node.y = node.ay;
    node.vx = 0;
    node.vy = 0;
  }
}

/**
 * Keeps a node inside the panel.
 *
 * Zeroing the velocity component on contact matters as much as moving the node, and for
 * a reason specific to d3: `forceCollide` resolves overlaps against a node's ANTICIPATED
 * position, ⟨x + vx, y + vy⟩, not its current one. Clamp the position but leave the
 * velocity pointing into the wall and collide computes against a phantom node outside
 * the panel - so neighbours get shoved away from a bubble that visibly is not there,
 * and the clamped one sticks to the edge vibrating. Killing the offending component
 * makes the boundary absorb the motion instead of fighting it.
 *
 * With the pack sized to fit (see `fitRadiusScale`) this should never actually fire; it
 * is a safety net for a viewport too small for any honest layout.
 */
export function clampToBounds(node: BubbleNode, width: number, height: number): void {
  const minX = node.radius;
  const maxX = width - node.radius;
  const minY = node.radius;
  const maxY = height - node.radius;

  if (node.x < minX) {
    node.x = minX;
    if (node.vx < 0) node.vx = 0;
  } else if (node.x > maxX) {
    node.x = maxX;
    if (node.vx > 0) node.vx = 0;
  }

  if (node.y < minY) {
    node.y = minY;
    if (node.vy < 0) node.vy = 0;
  } else if (node.y > maxY) {
    node.y = maxY;
    if (node.vy > 0) node.vy = 0;
  }
}

/**
 * The forces that defend the packed arrangement, returned stopped.
 *
 * Nothing here creates the layout - `packHomes` did that. Collision keeps bubbles off
 * each other when the orbit swings two of them together, the orbit holds each near its
 * home, and the centring force is a weak correction for the cloud as a whole.
 *
 * No `forceManyBody`: as mutual gravity it duplicates what the pack already achieved,
 * and as repulsion it fights collision and causes slow outward creep.
 *
 * The caller decides what happens next - run it live, or leave it alone for the
 * reduced-motion path, which wants the packed layout and no animation.
 */
export function createFieldSimulation(
  nodes: BubbleNode[],
  width: number,
  height: number,
): Simulation<BubbleNode, undefined> {
  const t = FIELD_TUNING;

  return forceSimulation<BubbleNode>(nodes)
    .velocityDecay(t.velocityDecay)
    .force("x", forceX<BubbleNode>(width / 2).strength(t.centerStrength))
    .force("y", forceY<BubbleNode>(height / 2).strength(t.centerStrength))
    .force(
      "collide",
      forceCollide<BubbleNode>(d => d.radius + t.collidePadding)
        .strength(t.collideStrength)
        .iterations(t.collideIterations),
    )
    .force("drift", forceOrbit(t.orbitRadius, t.orbitPull))
    .stop();
}
