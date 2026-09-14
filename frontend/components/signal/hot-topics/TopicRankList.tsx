"use client";

// ─── Hot Topics · rank list ───────────────────────────────────────────────────
//
// The table view. Not a fallback bolted on for compliance - it is the reason the
// bubble field is allowed to omit labels on small circles and to encode magnitude in
// an area, which no screen reader can read. Every value the field shows is reachable
// here without hovering, and it doubles as the view for anyone who just wants the
// ranking.

import { stepColor, type ThemeName } from "./palette";
import type { BubbleDatum } from "./types";

type Props = {
  data: BubbleDatum[];
  theme: ThemeName;
  selectedId: string | null;
  onSelect: (datum: BubbleDatum) => void;
};

export function TopicRankList({ data, theme, selectedId, onSelect }: Props) {
  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--sg-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {data.map((datum, i) => {
        const isSelected = selectedId === datum.id;
        return (
          <li key={datum.id}>
            <button
              type="button"
              onClick={() => onSelect(datum)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid var(--sg-border)",
                backgroundColor: isSelected ? "var(--sg-surface-hover)" : "transparent",
                cursor: "pointer",
                textAlign: "left",
                font: "inherit",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.backgroundColor = "var(--sg-surface-hover)";
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: stepColor(datum.colorStep, theme),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11.5,
                  color: "var(--sg-muted)",
                  minWidth: 18,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--sg-text)" }}>
                {datum.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--sg-muted)", whiteSpace: "nowrap" }}>
                {datum.topic.sourceIds.length} sources · {datum.topic.totalMentions} mentions
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
