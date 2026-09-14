"use client";

// ─── Hot Topics · simulation binding ──────────────────────────────────────────
//
// The one rule that governs this file: React owns STRUCTURE, the tick owns POSITION.
// Nothing here ever calls setState per frame - at 60fps that is 60 reconciliations a
// second and React's scheduler will not save you. The tick writes a `transform`
// attribute straight to the DOM node.

import { type Simulation } from "d3-force";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  clampToBounds,
  createFieldSimulation,
  FIELD_TUNING,
  packHomes,
  seedNodes,
  snapToHomes,
} from "./fieldSimulation";
import type { BubbleDatum, BubbleNode } from "./types";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * useSyncExternalStore rather than useState + useEffect: it takes an explicit server
 * snapshot, so the first client render already agrees with the server and the field
 * never flashes into motion before settling down.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }, []),
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * Observes an element's size, and whether it is on screen at all.
 *
 * A CALLBACK ref, not a plain one. The bubble container unmounts whenever the view
 * switches to the list and a new element mounts on the way back, and an effect keyed on
 * [] would still be observing the old detached node - which reports 0x0 on the way out
 * and never updates again, so the field returned to a zero width and rendered nothing.
 * A callback ref re-attaches both observers to whatever node is currently mounted.
 *
 * Visibility is here rather than in its own hook because both observers want the same
 * node, and two callback refs on one element is a mess to compose. It matters because
 * this field never cools to a stop: d3's timer is built on requestAnimationFrame, so it
 * pauses itself in a hidden TAB but keeps running when the panel is merely scrolled out
 * of view. On a laptop that is a real battery cost for something nobody is looking at.
 */
export function useElementSize<T extends Element>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Assume visible until told otherwise, so the field never starts out frozen on a
  // browser without IntersectionObserver.
  const [inView, setInView] = useState(true);
  const observersRef = useRef<Array<{ disconnect(): void }>>([]);

  const disconnectAll = useCallback(() => {
    for (const observer of observersRef.current) observer.disconnect();
    observersRef.current = [];
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      disconnectAll();
      if (!node) return;

      const resize = new ResizeObserver(entries => {
        const box = entries[0]?.contentRect;
        // Ignore the 0x0 an element reports as it detaches.
        if (box && box.width > 0) {
          setSize({ width: Math.round(box.width), height: Math.round(box.height) });
        }
      });
      resize.observe(node);
      observersRef.current.push(resize);

      if (typeof IntersectionObserver !== "undefined") {
        const intersection = new IntersectionObserver(
          entries => setInView(entries.some(entry => entry.isIntersecting)),
          // Start again slightly before it scrolls back into view, so the field is
          // already moving by the time it is on screen.
          { rootMargin: "120px" },
        );
        intersection.observe(node);
        observersRef.current.push(intersection);
      }
    },
    [disconnectAll],
  );

  useEffect(() => disconnectAll, [disconnectAll]);

  return { ref, inView, ...size };
}

type FieldOptions = {
  data: BubbleDatum[];
  width: number;
  height: number;
  /** Frozen fields still lay out; they just do not animate. */
  paused: boolean;
  reducedMotion: boolean;
};

/**
 * Binds the field simulation to a component: builds nodes when the data or the panel
 * size changes, paints each tick, and tears the simulation down on unmount.
 *
 * The forces themselves are NOT configured here - they live in `fieldSimulation`, so
 * the motion can be retuned and measured without React in the loop. See FIELD_TUNING.
 */
export function useBubbleField({ data, width, height, paused, reducedMotion }: FieldOptions) {
  const groupRefs = useRef<Map<string, SVGGElement | null>>(new Map());
  const simRef = useRef<Simulation<BubbleNode, undefined> | null>(null);
  const nodesRef = useRef<BubbleNode[]>([]);

  const registerGroup = useCallback((id: string, element: SVGGElement | null) => {
    if (element) groupRefs.current.set(id, element);
    else groupRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (data.length === 0 || width === 0 || height === 0) return;

    // Order is load-bearing: build the nodes, pack them to decide where each one
    // belongs, and only then attach the forces that defend that arrangement.
    const nodes = seedNodes(data, nodesRef.current);
    packHomes(nodes, width, height);
    nodesRef.current = nodes;

    const paint = () => {
      for (const node of nodes) {
        clampToBounds(node, width, height);
        groupRefs.current
          .get(node.id)
          ?.setAttribute("transform", `translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`);
      }
    };

    const simulation = createFieldSimulation(nodes, width, height).on("tick", paint);
    simRef.current = simulation;

    if (reducedMotion) {
      // Motion was never going to run, so the packed arrangement IS the layout. Drop
      // every bubble on its home and paint once.
      snapToHomes(nodes);
      paint();
    } else if (paused) {
      // Freeze where things currently are. Deliberately NOT snapToHomes: bubbles have
      // drifted away from their homes by now, so snapping would make pressing Pause
      // yank the whole field into place - the opposite of what "pause" promises. On a
      // first mount there is nothing to preserve and the nodes are already at home.
      paint();
    } else {
      simulation.alphaTarget(FIELD_TUNING.alphaTarget).restart();
    }

    // Mandatory, not optional: React StrictMode mounts, unmounts and remounts effects
    // in development. Without this you get two simulations writing to the same nodes
    // and the bubbles visibly vibrate.
    return () => {
      simulation.on("tick", null);
      simulation.stop();
      simRef.current = null;
    };
  }, [data, width, height, paused, reducedMotion]);

  return { registerGroup, nodesRef };
}
