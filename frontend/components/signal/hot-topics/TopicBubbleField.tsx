"use client";

// ─── Hot Topics · bubble field ────────────────────────────────────────────────
//
// The render layer, and the only file that knows the field is drawn as SVG. Layout,
// scale, colour and motion all live in sibling modules, so replacing this file with a
// canvas or WebGL version requires touching nothing else.
//
// SVG rather than canvas: at ~18 marks SVG is far below the ~1000-mark crossover, and
// it gives real hit-testing, focusable elements and screen-reader semantics for free -
// all of which would have to be hand-rolled on canvas.

import { useMemo, useRef, useState } from "react";

import { LABEL_MIN_RADIUS } from "./bubbleScale";
import { labelColor, stepColor, type ThemeName } from "./palette";
import type { BubbleDatum } from "./types";
import { useBubbleField } from "./useBubbleField";

/** Chars that fit on one line inside a circle: chord ~1.7r, average glyph ~0.52em. */
function fitsChars(radius: number, fontSize: number): number {
  return Math.max(1, Math.floor((1.7 * radius) / (0.52 * fontSize)));
}

/** Clamped both ways: unclamped, big bubbles get comic text and small ones get sub-legible text. */
function fontFor(radius: number): number {
  return Math.max(10, Math.min(18, radius * 0.34));
}

/**
 * Three tiers. The r < 18 tier is the important one - cramming 8px text into a small
 * circle reads worse than leaving it empty, so those bubbles carry their name in the
 * tooltip and the aria-label only.
 */
function layoutLabel(label: string, radius: number): string[] {
  if (radius < LABEL_MIN_RADIUS) return [];
  const font = fontFor(radius);
  const budget = fitsChars(radius, font);

  if (radius < 34 || !label.includes(" ")) {
    return [label.length <= budget ? label : `${label.slice(0, Math.max(1, budget - 1))}…`];
  }

  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= budget) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current);
  return lines.map(line =>
    line.length <= budget ? line : `${line.slice(0, Math.max(1, budget - 1))}…`,
  );
}

type Props = {
  data: BubbleDatum[];
  theme: ThemeName;
  paused: boolean;
  reducedMotion: boolean;
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (datum: BubbleDatum) => void;
  onHoverChange: (datum: BubbleDatum | null) => void;
};

export function TopicBubbleField({
  data,
  theme,
  paused,
  reducedMotion,
  width,
  height,
  selectedId,
  onSelect,
  onHoverChange,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { registerGroup } = useBubbleField({ data, width, height, paused, reducedMotion });

  // Keyed by id so a re-layout reuses the same DOM nodes and the transform written by
  // the tick survives. Sorted by rank, which fixes tab order to rank rather than to
  // wherever a bubble happens to have drifted.
  const ordered = useMemo(() => [...data].sort((a, b) => a.rank - b.rank), [data]);

  if (width === 0 || height === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      role="list"
      aria-label="Trending topics, sized by how widely each is being covered"
      style={{ display: "block", overflow: "visible", touchAction: "manipulation" }}
    >
      {ordered.map(datum => {
        const lines = layoutLabel(datum.label, datum.radius);
        const font = fontFor(datum.radius);
        const fill = stepColor(datum.colorStep, theme);
        const ink = labelColor(datum.colorStep, theme);
        const isActive = hoveredId === datum.id || selectedId === datum.id;

        return (
          <g
            key={datum.id}
            ref={element => registerGroup(datum.id, element)}
            role="listitem"
            tabIndex={0}
            aria-label={`${datum.label}. Covered by ${datum.topic.sourceIds.length} sources, ${datum.topic.totalMentions} mentions. Rank ${datum.rank + 1} of ${data.length}.`}
            onClick={() => onSelect(datum)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(datum);
              }
            }}
            onMouseEnter={() => {
              setHoveredId(datum.id);
              onHoverChange(datum);
            }}
            onMouseLeave={() => {
              setHoveredId(current => (current === datum.id ? null : current));
              onHoverChange(null);
            }}
            onFocus={() => {
              setHoveredId(datum.id);
              onHoverChange(datum);
            }}
            onBlur={() => {
              setHoveredId(current => (current === datum.id ? null : current));
              onHoverChange(null);
            }}
            style={{ cursor: "pointer", outline: "none" }}
          >
            {/* Native tooltip and an announced name. Values lead, label follows. */}
            <title>{`${datum.topic.sourceIds.length} sources · ${datum.topic.totalMentions} mentions — ${datum.label}`}</title>

            {/* Hit target, always at least 24px across even when the bubble is smaller. */}
            <circle r={Math.max(datum.radius + 4, 12)} fill="transparent" />

            <circle
              r={datum.radius}
              fill={fill}
              stroke={isActive ? "var(--sg-text)" : "var(--sg-bg)"}
              strokeWidth={isActive ? 2 : 2}
              style={{
                transition: "opacity 0.18s ease, stroke 0.18s ease",
                opacity: selectedId && selectedId !== datum.id ? 0.42 : 1,
              }}
            />

            {lines.length > 0 && (
              <text
                textAnchor="middle"
                pointerEvents="none"
                style={{
                  fontSize: font,
                  fontWeight: 600,
                  fill: ink,
                  letterSpacing: "-0.2px",
                  userSelect: "none",
                }}
              >
                {lines.map((line, i) => (
                  <tspan key={line + i} x={0} y={`${i - lines.length / 2 + 0.9}em`}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
