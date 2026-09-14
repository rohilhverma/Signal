"use client";

// ─── Hot Topics · view ────────────────────────────────────────────────────────
//
// Composition only. Deliberately holds no layout maths, no colour logic and no
// simulation - those live in the pure modules beside it, which is what makes the
// visualisation replaceable without touching article handling.
//
// The prop contract is unchanged from the list version this replaced, so DashboardPage
// passes exactly what it always did.

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Pause, Play } from "lucide-react";

import type { Article } from "../data/mockArticles";
import { toBubbleData } from "./bubbleScale";
import { stepColor, type ThemeName } from "./palette";
import { TopicBubbleField } from "./TopicBubbleField";
import { TopicRankList } from "./TopicRankList";
import type { BubbleDatum, HotTopic } from "./types";
import { useElementSize, usePrefersReducedMotion } from "./useBubbleField";

type Props = {
  topics: HotTopic[];
  theme: ThemeName;
  /**
   * Supplied by the page rather than imported, because ArticleCard lives inside
   * DashboardPage and importing it here would be circular. It also means this module
   * carries no opinion about how an article looks - which is the point of the split.
   */
  renderArticle: (article: Article, matchLabel: string) => React.ReactNode;
  stats: { articleCount: number; sourceCount: number };
};

const FIELD_HEIGHT = 460;

export function HotTopicsView({ topics, theme, renderArticle, stats }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { ref: fieldRef, width, inView } = useElementSize<HTMLDivElement>();
  const [mode, setMode] = useState<"bubbles" | "list">("bubbles");
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<BubbleDatum | null>(null);

  const data = useMemo(
    () => toBubbleData(topics, width || 900, FIELD_HEIGHT),
    [topics, width],
  );

  // A topic that drops out of the feed must not leave a stale selection behind.
  useEffect(() => {
    if (selectedId && !topics.some(t => t.term === selectedId)) setSelectedId(null);
  }, [topics, selectedId]);

  const selected = useMemo(
    () => data.find(d => d.id === selectedId) ?? null,
    [data, selectedId],
  );

  const selectedArticles = useMemo(() => {
    if (!selected) return [];
    const seen = new Set<string>();
    const out: Article[] = [];
    for (const sourceId of selected.topic.sourceIds) {
      for (const article of selected.topic.articlesBySource.get(sourceId) ?? []) {
        if (!seen.has(article.id)) {
          seen.add(article.id);
          out.push(article);
        }
      }
    }
    return out;
  }, [selected]);

  if (topics.length === 0) {
    return (
      <div
        style={{
          padding: "48px 0",
          textAlign: "center",
          color: "var(--sg-muted)",
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        Not enough cross-source coverage yet. Add more sources or check back after a feed update.
      </div>
    );
  }

  const showingBubbles = mode === "bubbles";

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.11em",
            textTransform: "uppercase",
            color: "var(--sg-muted)",
            opacity: 0.7,
            flex: 1,
          }}
        >
          Topics trending across multiple sources right now
        </div>

        {showingBubbles && !reducedMotion && (
          <IconToggle
            active={paused}
            onClick={() => setPaused(p => !p)}
            label={paused ? "Resume motion" : "Pause motion"}
          >
            {paused ? <Play style={{ width: 13, height: 13 }} /> : <Pause style={{ width: 13, height: 13 }} />}
          </IconToggle>
        )}
        <IconToggle
          active={!showingBubbles}
          onClick={() => setMode(m => (m === "bubbles" ? "list" : "bubbles"))}
          label={showingBubbles ? "Show as list" : "Show as bubbles"}
        >
          {showingBubbles ? <List style={{ width: 13, height: 13 }} /> : <LayoutGrid style={{ width: 13, height: 13 }} />}
        </IconToggle>
      </div>

      {showingBubbles ? (
        <div
          ref={fieldRef}
          style={{
            position: "relative",
            height: FIELD_HEIGHT,
            borderRadius: 12,
            border: "1px solid var(--sg-border)",
            backgroundColor: "var(--sg-bg)",
            overflow: "hidden",
          }}
        >
          <TopicBubbleField
            data={data}
            theme={theme}
            // Scrolled out of view is, as far as the simulation is concerned, paused.
            paused={paused || !inView}
            reducedMotion={reducedMotion}
            width={width}
            height={FIELD_HEIGHT}
            selectedId={selectedId}
            onSelect={d => setSelectedId(current => (current === d.id ? null : d.id))}
            onHoverChange={setHovered}
          />
          {hovered && <FieldTooltip datum={hovered} theme={theme} />}
        </div>
      ) : (
        <TopicRankList
          data={data}
          theme={theme}
          selectedId={selectedId}
          onSelect={d => setSelectedId(current => (current === d.id ? null : d.id))}
        />
      )}

      <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--sg-muted)", opacity: 0.75 }}>
        Bubble area is proportional to how widely a topic is covered.
        {showingBubbles ? " Select one to read its articles." : ""}
      </p>

      {selected && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              fontSize: 13,
              color: "var(--sg-muted)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: stepColor(selected.colorStep, theme),
              }}
            />
            <strong style={{ color: "var(--sg-text)", fontSize: 15 }}>{selected.label}</strong>
            <span>
              · {selectedArticles.length} article{selectedArticles.length === 1 ? "" : "s"} across{" "}
              {selected.topic.sourceIds.length} sources
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedArticles.map(article => (
              <div key={article.id}>{renderArticle(article, selected.label)}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 32, fontSize: 12, color: "var(--sg-muted)", opacity: 0.8 }}>
        {stats.sourceCount} sources · {stats.articleCount} articles
      </div>
    </div>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function IconToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: 6,
        border: "1px solid var(--sg-border)",
        backgroundColor: active ? "var(--sg-surface-hover)" : "transparent",
        color: "var(--sg-muted)",
        cursor: "pointer",
        transition: "background-color 0.15s ease",
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--sg-surface-hover)")}
      onMouseLeave={e =>
        (e.currentTarget.style.backgroundColor = active ? "var(--sg-surface-hover)" : "transparent")
      }
    >
      {children}
    </button>
  );
}

/** Values lead, label follows - the reader already knows which bubble they are on. */
function FieldTooltip({ datum, theme }: { datum: BubbleDatum; theme: ThemeName }) {
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 11px",
        borderRadius: 8,
        border: "1px solid var(--sg-border)",
        backgroundColor: "var(--sg-surface)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.09)",
        maxWidth: "calc(100% - 24px)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 3,
          height: 20,
          borderRadius: 2,
          backgroundColor: stepColor(datum.colorStep, theme),
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--sg-text)", whiteSpace: "nowrap" }}>
        {datum.topic.sourceIds.length} sources · {datum.topic.totalMentions} mentions
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--sg-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {datum.label}
      </span>
    </div>
  );
}
