// ─── Hot Topics · domain types ────────────────────────────────────────────────
//
// The layering this directory exists to enforce:
//
//   computeHotTopics .................. text -> HotTopic[] via compromise (pure, no React)
//   bubbleScale / palette ............ HotTopic[] -> BubbleDatum[]   (pure, no React)
//   packing .......................... radii -> a nestled arrangement (pure geometry)
//   fieldSimulation / forceDrift ..... BubbleDatum[] -> positions + motion (no React)
//   useBubbleField ................... binds the above to a component lifecycle
//   TopicBubbleField / TopicRankList . the only files that render anything
//
// Everything above the render layer is plain TypeScript with no DOM and no React
// import, so the visualisation can be rewritten - canvas, WebGL, a different
// layout entirely - by replacing the two render files and nothing else.

import type { Article } from "../data/mockArticles";

/** One trending term, as produced by `computeHotTopics`. */
export type HotTopic = {
  /** Display form, e.g. "Artificial Intelligence". */
  term: string;
  /** Source ids covering this topic, in the caller's source order. */
  sourceIds: string[];
  /** Raw occurrence count across every article. */
  totalMentions: number;
  /** Articles that mention the term, grouped by source. */
  articlesBySource: Map<string, Article[]>;
};

/** A topic with everything the layout needs, and nothing it does not. */
export type BubbleDatum = {
  /** Stable identity across re-layouts. The term itself is unique per result set. */
  id: string;
  label: string;
  /** The quantity the area encodes. */
  value: number;
  /** Rank in the result set, 0 = hottest. Drives tab order and the aria label. */
  rank: number;
  radius: number;
  /** Index into the active theme's ordinal ramp. */
  colorStep: number;
  topic: HotTopic;
};

/** Live simulation state for one bubble. Mutated in place by d3-force. */
export type BubbleNode = BubbleDatum & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * Packed home position. Ambient motion orbits this point instead of wandering from
   * wherever the bubble happens to be, which is what keeps the cloud from inflating.
   */
  ax: number;
  ay: number;
  /** Drift phase offsets, seeded once so bubbles never move in lockstep. */
  phaseX: number;
  phaseY: number;
  freqX: number;
  freqY: number;
};
