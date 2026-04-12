"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  Newspaper,
  ChevronDown,
  ChevronUp,
  Bookmark,
  ExternalLink,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  type Source,
  type Article,
  type SummaryMode,
  DEFAULT_ACCENT,
} from "../data/mockArticles";
import { usePreferences } from "../context/PreferencesContext";
import { useAppState } from "../context/AppStateContext";
import { useToast } from "../context/ToastContext";

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatHoursAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  return `${hours}h ago`;
}

function estimateReadTime(wordCount: number): string {
  const minutes = Math.max(1, Math.round(wordCount / 200));
  return `${minutes} min read`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

type AgeState = "new" | "read" | "expired";

function getAgeState(article: Article, seenIds: Set<string>): AgeState {
  const ageHours = (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours >= 24) return "expired";
  if (seenIds.has(article.id)) return "read";
  return "new";
}

// Extract the summary text from a raw Gemini JSON response or plain string.
// Returns null (instead of the raw JSON) when the string looks like JSON but
// can't be properly extracted — this prevents raw-JSON display and allows
// handleSummaryModeChange to re-fetch rather than treating it as preloaded.
function normalizeSummaryValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const lines = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : null;
  }

  return null;
}

function extractSummaryText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!trimmed) return null;

  if (/^(Gemini error:|Cache miss:)/i.test(trimmed)) {
    return null;
  }

  // JSON string wrapper: "\"[{\\\"summary\\\":\\\"...\\\"}]\""
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const unwrapped = JSON.parse(trimmed) as string;
      if (typeof unwrapped === "string" && unwrapped !== trimmed) {
        return extractSummaryText(unwrapped);
      }
    } catch {}
  }

  // JSON array: [{"title":"...","summary":"..."}]
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{ summary?: unknown }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeSummaryValue(parsed[0]?.summary);
      }
    } catch {}
  }

  // JSON object (Gemini sometimes returns an object instead of an array):
  // {"title":"...","summary":"..."} or {"summary":"..."}
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { summary?: unknown };
      return normalizeSummaryValue(parsed?.summary);
    } catch {}
  }

  // Fallback for Gemini's malformed JSON-ish responses, e.g.
  // [{title:'...',summary:'...'}] or {"summary":"..."} with escaping issues.
  const summaryFieldMatch = trimmed.match(
    /["']summary["']\s*:\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)')/s
  );
  const summaryField = summaryFieldMatch?.[1] ?? summaryFieldMatch?.[2];
  if (summaryField) {
    return summaryField
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'")
      .trim() || null;
  }

  // Plain text — return as-is
  return trimmed || null;
}

function splitShortSummary(summary: string): string[] {
  return summary
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])\s+(?=(?:[-•*]\s)|(?:\d+\.\s))/g, "$1\n")
    .split("\n")
    .map((line) => line.trim().replace(/^[-•*\d.)\s]+/, ""))
    .filter(Boolean);
}

// Get the active summary text for an article given a mode, extracting from JSON if needed
function getActiveSummary(article: Article, mode: SummaryMode): string | null {
  if (mode === "short") return extractSummaryText(article.summaryShort);
  if (mode === "deepDive") return extractSummaryText(article.summaryDeepDive);
  return extractSummaryText(article.summaryDefault) ?? "";
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 10,
        border: "1px solid var(--sg-border)",
        backgroundColor: "var(--sg-surface)",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div className="shimmer" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <div className="shimmer" style={{ width: 80, height: 10, borderRadius: 4 }} />
            <div className="shimmer" style={{ width: 50, height: 10, borderRadius: 4 }} />
          </div>
          <div className="shimmer" style={{ width: "85%", height: 14, borderRadius: 4, marginBottom: 6 }} />
          <div className="shimmer" style={{ width: "65%", height: 14, borderRadius: 4, marginBottom: 12 }} />
          <div className="shimmer" style={{ width: "100%", height: 11, borderRadius: 4, marginBottom: 5 }} />
          <div className="shimmer" style={{ width: "95%", height: 11, borderRadius: 4, marginBottom: 5 }} />
          <div className="shimmer" style={{ width: "70%", height: 11, borderRadius: 4, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <div className="shimmer" style={{ width: 55, height: 10, borderRadius: 4 }} />
            <div className="shimmer" style={{ width: 70, height: 10, borderRadius: 4 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onAddSource }: { onAddSource: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          backgroundColor: "var(--sg-accent-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Newspaper style={{ width: 36, height: 36, color: "var(--sg-text)", opacity: 0.5 }} />
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--sg-text)", marginBottom: 8, letterSpacing: "-0.3px" }}>
        Your feed is empty
      </h3>
      <p style={{ fontSize: 14, color: "var(--sg-muted)", lineHeight: 1.6, maxWidth: 280, marginBottom: 24 }}>
        Add your first news source to start receiving AI-powered summaries.
      </p>
      <button
        onClick={onAddSource}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--sg-fab-color, #fff)",
          backgroundColor: "var(--sg-fab-bg, var(--sg-text))",
          border: "none",
          padding: "10px 22px",
          borderRadius: 8,
          cursor: "pointer",
          transition: "opacity 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.82")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        Add a Source
      </button>
    </div>
  );
}

// ─── Favicon Bubble ──────────────────────────────────────────────────────────

function FaviconBubble({
  src,
  alt,
  size = 28,
  accentColor,
}: {
  src: string;
  alt: string;
  size?: number;
  accentColor?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: accentColor ? `${accentColor}18` : "var(--sg-surface-hover)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: size * 0.42,
          fontWeight: 700,
          color: accentColor ?? "var(--sg-muted)",
          border: accentColor ? `1.5px solid ${accentColor}40` : "1.5px solid var(--sg-border)",
        }}
      >
        {alt.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        border: accentColor ? `1.5px solid ${accentColor}55` : "1.5px solid var(--sg-border)",
        backgroundColor: "var(--sg-surface)",
      }}
    />
  );
}

// ─── Summary Mode Toggle ─────────────────────────────────────────────────────

const SUMMARY_MODES: { key: SummaryMode; label: string }[] = [
  { key: "short", label: "Short" },
  { key: "default", label: "Default" },
  { key: "deepDive", label: "Deep Dive" },
];

function SummaryModeToggle({
  activeMode,
  onSelect,
  accentColor,
  loadingModes,
}: {
  activeMode: SummaryMode;
  onSelect: (mode: SummaryMode) => void;
  accentColor: string;
  loadingModes: Set<SummaryMode>;
}) {
  return (
    <div
      role="group"
      aria-label="Summary mode"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        backgroundColor: "var(--sg-surface-hover)",
        borderRadius: 6,
        padding: 2,
        border: "1px solid var(--sg-border)",
      }}
    >
      {SUMMARY_MODES.map(({ key, label }) => {
        const isActive = activeMode === key;
        const isLoading = loadingModes.has(key);
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            aria-pressed={isActive}
            style={{
              fontSize: 10.5,
              fontWeight: isActive ? 600 : 400,
              padding: "3px 8px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
              backgroundColor: isActive ? accentColor : "transparent",
              color: isActive ? "#fff" : "var(--sg-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
            }}
          >
            {isLoading && !isActive && (
              <Loader2 style={{ width: 9, height: 9, animation: "spin 1s linear infinite" }} />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CompactBulletList({
  items,
  accentColor,
  fontSize,
  opacity,
}: {
  items: string[];
  accentColor: string;
  fontSize: number;
  opacity: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((bullet, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <span
            aria-hidden="true"
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              backgroundColor: accentColor,
              opacity: opacity * 0.9,
              flexShrink: 0,
              marginTop: Math.max(6, Math.round(fontSize * 0.48)),
            }}
          />
          <span
            style={{
              fontSize,
              color: "var(--sg-text)",
              opacity,
              lineHeight: 1.6,
            }}
          >
            {bullet}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Article Card ─────────────────────────────────────────────────────────────

interface ArticleCardProps {
  article: Article;
  source: Source;
  ageState: AgeState;
  expanded: boolean;
  onToggleExpand: () => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  isNew: boolean;
  summaryMode: SummaryMode;
  onSummaryModeChange: (mode: SummaryMode) => void;
  loadingModes: Set<SummaryMode>;
  sourceCollapsed: boolean;
}

function ArticleCard({
  article,
  source,
  ageState,
  expanded,
  onToggleExpand,
  bookmarked,
  onToggleBookmark,
  isNew,
  summaryMode,
  onSummaryModeChange,
  loadingModes,
  sourceCollapsed,
}: ArticleCardProps) {
  const isRead = ageState === "read";
  const accent = source.accentColor ?? DEFAULT_ACCENT;
  const accentOpacity = isRead ? 0.28 : 1;
  const textOpacity = isRead ? 0.55 : 1;
  const shadowIntensity = isRead ? "none" : "0 1px 4px rgba(0,0,0,0.06)";
  const activeSummary = getActiveSummary(article, summaryMode);
  const isLoadingCurrent = loadingModes.has(summaryMode);
  const shortSummaryLines = summaryMode === "short" && activeSummary
    ? splitShortSummary(activeSummary)
    : [];

  return (
    <article
      style={{
        position: "relative",
        borderRadius: 10,
        border: "1px solid var(--sg-border)",
        backgroundColor: "var(--sg-surface)",
        boxShadow: shadowIntensity,
        overflow: "hidden",
        transition: "box-shadow 0.2s ease",
      }}
    >
      {/* Left accent stripe — source brand color */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          backgroundColor: accent,
          opacity: accentOpacity,
          transition: "opacity 0.25s ease",
        }}
      />

      <div style={{ padding: "13px 15px 13px 19px" }}>
        {/* Top row: favicon + title + actions */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <FaviconBubble src={source.faviconUrl} alt={source.name} size={26} accentColor={accent} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Meta row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--sg-muted)", opacity: textOpacity, transition: "opacity 0.25s ease" }}>
                {formatHoursAgo(article.publishedAt)}
              </span>
              <span style={{ fontSize: 11, color: "var(--sg-border)" }}>·</span>
              <span style={{ fontSize: 11, color: "var(--sg-muted)", opacity: textOpacity, transition: "opacity 0.25s ease" }}>
                {estimateReadTime(article.originalWordCount)}
              </span>
              <span style={{ fontSize: 11, color: "var(--sg-border)" }}>·</span>
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--sg-muted)",
                  opacity: textOpacity * 0.85,
                  fontFamily: "var(--font-jetbrains-mono, monospace)",
                  transition: "opacity 0.25s ease",
                }}
              >
                {formatNumber(article.originalWordCount)} → {formatNumber(article.summaryWordCount)} words
              </span>
              {isNew && !isRead && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: "#fff",
                    backgroundColor: accent,
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  New
                </span>
              )}
            </div>

            {/* Title */}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: isRead ? 500 : 600,
                color: "var(--sg-text)",
                opacity: textOpacity,
                lineHeight: 1.45,
                letterSpacing: "-0.1px",
                textDecoration: "none",
                transition: "opacity 0.25s ease",
                marginBottom: 2,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = "underline")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = "none")}
            >
              {article.title}
            </a>
          </div>

          {/* Right-side action icons */}
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, paddingTop: 2 }}>
            <button
              onClick={onToggleBookmark}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark article"}
              style={{
                background: "none",
                border: "none",
                padding: 5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 5,
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--sg-nav-hover)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
            >
              <Bookmark
                style={{
                  width: 14,
                  height: 14,
                  fill: bookmarked ? accent : "none",
                  stroke: bookmarked ? accent : "var(--sg-muted)",
                  transition: "fill 0.15s ease, stroke 0.15s ease",
                }}
              />
            </button>

            <button
              onClick={onToggleExpand}
              aria-label={expanded ? "Collapse summary" : "Expand summary"}
              style={{
                background: "none",
                border: "none",
                padding: 5,
                cursor: "pointer",
                color: "var(--sg-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 5,
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--sg-nav-hover)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
            >
              {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </div>

        {/* Expanded summary */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: expanded ? 600 : 0,
            opacity: expanded ? (isRead ? 0.62 : 1) : 0,
            transition: "max-height 0.28s ease, opacity 0.2s ease",
          }}
        >
          {(isLoadingCurrent || activeSummary) && (
            <div style={{ paddingLeft: 36, marginTop: 10 }}>
              {isLoadingCurrent ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                  <Loader2
                    style={{
                      width: 14,
                      height: 14,
                      color: accent,
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  <span style={{ fontSize: 12.5, color: "var(--sg-muted)" }}>Generating summary…</span>
                </div>
              ) : summaryMode === "short" && shortSummaryLines.length > 0 ? (
                <CompactBulletList
                  items={shortSummaryLines}
                  accentColor={accent}
                  fontSize={13}
                  opacity={isRead ? 0.6 : 0.88}
                />
              ) : activeSummary ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activeSummary.split("\n\n").filter(Boolean).map((para, i) => (
                    <p
                      key={i}
                      style={{
                        fontSize: 13,
                        color: "var(--sg-text)",
                        opacity: isRead ? 0.6 : 0.88,
                        lineHeight: 1.68,
                        margin: 0,
                      }}
                    >
                      {para.trim()}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Collapsed preview (2-line clamp) */}
        <div style={{
          overflow: "hidden",
          maxHeight: !expanded && !sourceCollapsed ? 60 : 0,
          opacity: !expanded && !sourceCollapsed ? textOpacity * 0.8 : 0,
          marginTop: !expanded && !sourceCollapsed ? 6 : 0,
          transition: "max-height 0.28s ease, opacity 0.22s ease, margin-top 0.25s ease",
        }}>
          <p style={{
            fontSize: 12.5,
            color: "var(--sg-muted)",
            lineHeight: 1.6,
            paddingLeft: 36,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {article.summaryDefault}
          </p>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, paddingLeft: 36 }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: "var(--sg-muted)",
              opacity: textOpacity * 0.8,
              display: "flex",
              alignItems: "center",
              gap: 3,
              textDecoration: "none",
              transition: "color 0.15s ease, opacity 0.25s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = accent;
              (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--sg-muted)";
              (e.currentTarget as HTMLElement).style.opacity = String(textOpacity * 0.8);
            }}
          >
            <ExternalLink style={{ width: 10, height: 10 }} />
            Read original
          </a>
          {expanded && (
            <div style={{ marginLeft: "auto" }}>
              <SummaryModeToggle
                activeMode={summaryMode}
                onSelect={onSummaryModeChange}
                accentColor={accent}
                loadingModes={loadingModes}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Source Group ─────────────────────────────────────────────────────────────

interface SourceGroupProps {
  source: Source;
  articles: Article[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (id: string) => void;
  seenIds: Set<string>;
  newSinceLastVisit: Set<string>;
  summaryModes: Map<string, SummaryMode>;
  onSummaryModeChange: (articleId: string, mode: SummaryMode) => void;
  loadingModesByArticle: Map<string, Set<SummaryMode>>;
  sourceCollapsed: boolean;
  onToggleSourceCollapse: () => void;
}

function SourceGroup({
  source,
  articles,
  expandedIds,
  onToggleExpand,
  bookmarkedIds,
  onToggleBookmark,
  seenIds,
  newSinceLastVisit,
  summaryModes,
  onSummaryModeChange,
  loadingModesByArticle,
  sourceCollapsed,
  onToggleSourceCollapse,
}: SourceGroupProps) {
  const accent = source.accentColor ?? DEFAULT_ACCENT;
  const visibleArticles = articles.filter((a) => getAgeState(a, seenIds) !== "expired");
  if (visibleArticles.length === 0) return null;

  const COLLAPSED_LIMIT = 4;
  const displayedArticles = sourceCollapsed ? visibleArticles.slice(0, COLLAPSED_LIMIT) : visibleArticles;
  const hiddenCount = sourceCollapsed ? Math.max(0, visibleArticles.length - COLLAPSED_LIMIT) : 0;

  return (
    <section aria-label={source.name} style={{ "--source-accent": accent } as React.CSSProperties}>
      {/* Source header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: 8,
          backgroundColor: `${accent}0d`,
          border: `1px solid ${accent}22`,
        }}
      >
        <FaviconBubble src={source.faviconUrl} alt={source.name} size={20} accentColor={accent} />
        <span style={{ fontSize: 15, fontWeight: 700, color: accent, letterSpacing: "0.01em" }}>
          {source.name}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--sg-muted)",
            backgroundColor: `${accent}14`,
            border: `1px solid ${accent}28`,
            padding: "1px 7px",
            borderRadius: 12,
            fontWeight: 500,
          }}
        >
          {visibleArticles.length}
        </span>
        <button
          onClick={onToggleSourceCollapse}
          aria-label={sourceCollapsed ? "Expand source" : "Collapse source"}
          title={sourceCollapsed ? "Expand all" : "Collapse all"}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            padding: "3px 6px",
            cursor: "pointer",
            color: "var(--sg-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            borderRadius: 5,
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--sg-nav-hover)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
        >
          {sourceCollapsed
            ? <><ChevronsUpDown style={{ width: 12, height: 12 }} /> Expand</>
            : <><ChevronsDownUp style={{ width: 12, height: 12 }} /> Collapse</>
          }
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayedArticles.map((article) => {
          const ageState = getAgeState(article, seenIds);
          return (
            <ArticleCard
              key={article.id}
              article={article}
              source={source}
              ageState={ageState}
              expanded={expandedIds.has(article.id)}
              onToggleExpand={() => onToggleExpand(article.id)}
              bookmarked={bookmarkedIds.has(article.id)}
              onToggleBookmark={() => onToggleBookmark(article.id)}
              isNew={newSinceLastVisit.has(article.id)}
              summaryMode={summaryModes.get(article.id) ?? "default"}
              onSummaryModeChange={(mode) => onSummaryModeChange(article.id, mode)}
              loadingModes={loadingModesByArticle.get(article.id) ?? new Set()}
              sourceCollapsed={sourceCollapsed}
            />
          );
        })}
        {hiddenCount > 0 && (
          <button
            onClick={onToggleSourceCollapse}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--sg-muted)",
              fontSize: 12,
              fontWeight: 500,
              textAlign: "left",
              padding: "4px 0 0 6px",
              letterSpacing: "0.02em",
            }}
          >
            ··· {hiddenCount} more {hiddenCount === 1 ? "article" : "articles"}
          </button>
        )}
      </div>
    </section>
  );
}

// ─── Reader View ─────────────────────────────────────────────────────────────

interface ReaderViewProps {
  articles: Article[];
  sources: Source[];
  bookmarkedIds: Set<string>;
  onToggleBookmark: (id: string) => void;
  summaryModes: Map<string, SummaryMode>;
  onSummaryModeChange: (articleId: string, mode: SummaryMode) => void;
  loadingModesByArticle: Map<string, Set<SummaryMode>>;
  seenIds: Set<string>;
  newSinceLastVisit: Set<string>;
}

function ReaderView({
  articles,
  sources,
  bookmarkedIds,
  onToggleBookmark,
  summaryModes,
  onSummaryModeChange,
  loadingModesByArticle,
  seenIds,
  newSinceLastVisit,
}: ReaderViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setCurrentIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setCurrentIndex((i) => Math.min(articles.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [articles.length]);

  // Touch/swipe support
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta < 0) setCurrentIndex((i) => Math.min(articles.length - 1, i + 1)); // swipe left → next
      else setCurrentIndex((i) => Math.max(0, i - 1)); // swipe right → prev
    }
    touchStartX.current = null;
  }

  if (articles.length === 0) return null;

  const article = articles[currentIndex];
  const source = sourceMap.get(article.sourceId);
  const accent = source?.accentColor ?? DEFAULT_ACCENT;
  const isRead = getAgeState(article, seenIds) === "read";
  const bookmarked = bookmarkedIds.has(article.id);
  const isNew = newSinceLastVisit.has(article.id);
  const summaryMode = summaryModes.get(article.id) ?? "default";
  const activeSummary = getActiveSummary(article, summaryMode);
  const isLoadingCurrent = (loadingModesByArticle.get(article.id) ?? new Set()).has(summaryMode);
  const shortSummaryLines = summaryMode === "short" && activeSummary
    ? splitShortSummary(activeSummary)
    : [];

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "calc(100vh - 52px)",
        padding: "32px 24px 100px",
      }}
    >
      {/* Article content */}
      <article
        style={{
          width: "100%",
          maxWidth: 860,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Source row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {source && (
            <FaviconBubble src={source.faviconUrl} alt={source.name} size={22} accentColor={accent} />
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{source?.name}</span>
          <span style={{ fontSize: 11, color: "var(--sg-border)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--sg-muted)" }}>{formatHoursAgo(article.publishedAt)}</span>
          <span style={{ fontSize: 11, color: "var(--sg-border)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--sg-muted)" }}>{estimateReadTime(article.originalWordCount)}</span>
          {isNew && !isRead && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "#fff",
                backgroundColor: accent,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              New
            </span>
          )}
        </div>

        {/* Left accent bar + title */}
        <div style={{ display: "flex", gap: 14 }}>
          <div
            style={{
              width: 3,
              borderRadius: 2,
              backgroundColor: accent,
              opacity: isRead ? 0.28 : 1,
              flexShrink: 0,
              alignSelf: "stretch",
            }}
          />
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--sg-text)",
              lineHeight: 1.35,
              letterSpacing: "-0.4px",
              textDecoration: "none",
              opacity: isRead ? 0.6 : 1,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = "underline")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = "none")}
          >
            {article.title}
          </a>
        </div>

        {/* Summary mode toggle */}
        <div>
          <SummaryModeToggle
            activeMode={summaryMode}
            onSelect={(mode) => onSummaryModeChange(article.id, mode)}
            accentColor={accent}
            loadingModes={loadingModesByArticle.get(article.id) ?? new Set()}
          />
        </div>

        {/* Summary body */}
        {(isLoadingCurrent || activeSummary) && (
          <div
            style={{
              backgroundColor: "var(--sg-surface)",
              border: "1px solid var(--sg-border)",
              borderRadius: 10,
              padding: "20px 24px",
            }}
          >
            {isLoadingCurrent ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Loader2 style={{ width: 16, height: 16, color: accent, animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 14, color: "var(--sg-muted)" }}>Generating summary…</span>
              </div>
            ) : summaryMode === "short" && shortSummaryLines.length > 0 ? (
              <CompactBulletList
                items={shortSummaryLines}
                accentColor={accent}
                fontSize={15}
                opacity={0.9}
              />
            ) : activeSummary ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {activeSummary.split("\n\n").filter(Boolean).map((para, i) => (
                  <p key={i} style={{ fontSize: 15, color: "var(--sg-text)", lineHeight: 1.75, margin: 0, opacity: 0.9 }}>
                    {para.trim()}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Actions row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: accent,
              display: "flex",
              alignItems: "center",
              gap: 4,
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: 6,
              border: `1px solid ${accent}40`,
              backgroundColor: `${accent}0c`,
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.78")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <ExternalLink style={{ width: 11, height: 11 }} />
            Read original
          </a>
          <button
            onClick={() => onToggleBookmark(article.id)}
            style={{
              background: "none",
              border: `1px solid var(--sg-border)`,
              padding: "6px 12px",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 500,
              color: bookmarked ? accent : "var(--sg-muted)",
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <Bookmark
              style={{
                width: 12,
                height: 12,
                fill: bookmarked ? accent : "none",
                stroke: bookmarked ? accent : "var(--sg-muted)",
              }}
            />
            {bookmarked ? "Saved" : "Save"}
          </button>
        </div>
      </article>

      {/* Navigation controls — fixed at bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          backgroundColor: "var(--sg-toolbar)",
          borderTop: "1px solid var(--sg-border)",
          backdropFilter: "blur(8px)",
          zIndex: 30,
        }}
      >
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous article"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12.5,
            fontWeight: 500,
            padding: "7px 14px",
            borderRadius: 7,
            border: "1px solid var(--sg-border)",
            backgroundColor: "var(--sg-surface)",
            color: currentIndex === 0 ? "var(--sg-border)" : "var(--sg-text)",
            cursor: currentIndex === 0 ? "not-allowed" : "pointer",
            transition: "opacity 0.15s ease",
          }}
          onMouseEnter={(e) => { if (currentIndex !== 0) e.currentTarget.style.opacity = "0.75"; }}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <ChevronLeft style={{ width: 13, height: 13 }} />
          Previous
        </button>

        <span style={{ fontSize: 12, color: "var(--sg-muted)", fontWeight: 500 }}>
          Article {currentIndex + 1} of {articles.length}
        </span>

        <button
          onClick={() => setCurrentIndex((i) => Math.min(articles.length - 1, i + 1))}
          disabled={currentIndex === articles.length - 1}
          aria-label="Next article"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12.5,
            fontWeight: 500,
            padding: "7px 14px",
            borderRadius: 7,
            border: "1px solid var(--sg-border)",
            backgroundColor: "var(--sg-surface)",
            color: currentIndex === articles.length - 1 ? "var(--sg-border)" : "var(--sg-text)",
            cursor: currentIndex === articles.length - 1 ? "not-allowed" : "pointer",
            transition: "opacity 0.15s ease",
          }}
          onMouseEnter={(e) => { if (currentIndex !== articles.length - 1) e.currentTarget.style.opacity = "0.75"; }}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Next
          <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

// Per-article summary content (mutable in state)
type ArticleSummaryCache = Map<string, Partial<Record<SummaryMode, string>>>;

export function DashboardPage() {
  const navigate = useNavigate();
  const { density, viewMode } = usePreferences();
  const { state: appState, saveBookmark, removeBookmark, isBookmarked, addSource, setArticles, patchArticleSummary: patchArticle } = useAppState();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(appState.sources.length === 0);
  const sources = appState.sources;
  const articles = appState.articles;

  const lastVisitRef = useRef<Date>(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const [newSinceLastVisit, setNewSinceLastVisit] = useState<Set<string>>(new Set());
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());

  // Per-article active summary mode
  const [summaryModes, setSummaryModes] = useState<Map<string, SummaryMode>>(new Map());

  // Cache of fetched summaries (keyed by articleId → mode → text)
  const [summaryCache, setSummaryCache] = useState<ArticleSummaryCache>(new Map());

  // Tracks which modes are currently loading per article
  const [loadingModesByArticle, setLoadingModesByArticle] = useState<Map<string, Set<SummaryMode>>>(new Map());

  // Fetch / load data
  useEffect(() => {
    if (sources.length > 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/user/website?username=rohil");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend error ${res.status}: ${text}`);
        }
        const response = await res.json() as Record<
          string,
          { siteName: string | null; paywall: string | null; articles: Array<Record<string, { date: string; link: string; summaryDefault: string; summaryShort: string; summaryLong: string }>> }
        >;

        if (cancelled) return;

        const derivedSources: Source[] = await Promise.all(
          Object.keys(response).map(async (sourceUrl) => {
            const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
            let faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
            let accentColor = DEFAULT_ACCENT;
            try {
              const fav = await fetch(`/api/favicon?domain=${hostname}`).then((r) => r.json()) as { faviconUrl: string; color: string };
              faviconUrl = fav.faviconUrl;
              accentColor = fav.color;
            } catch {}
            return {
              id: sourceUrl,
              name: response[sourceUrl].siteName ?? hostname.split(".")[0].replace(/^\w/, (c) => c.toUpperCase()),
              domain: hostname,
              faviconUrl,
              accentColor,
              paywall: response[sourceUrl].paywall,
            };
          })
        );

        const derivedArticles: Article[] = Object.entries(response).flatMap(
          ([sourceUrl, { articles: articleList }]) =>
            articleList.flatMap((articleEntry) =>
              Object.entries(articleEntry).map(([title, fields]) => ({
                id: fields.link,
                sourceId: sourceUrl,
                title,
                url: fields.link,
                summaryDefault: extractSummaryText(fields.summaryDefault) ?? "",
                summaryShort: extractSummaryText(fields.summaryShort),
                summaryDeepDive: extractSummaryText(fields.summaryLong),
                publishedAt: new Date(fields.date),
                originalWordCount: 0,
                summaryWordCount: (extractSummaryText(fields.summaryDefault) ?? "")
                  .split(/\s+/)
                  .filter(Boolean)
                  .length,
              }))
            )
        );

        derivedSources.forEach((s) => addSource(s));
        setArticles(derivedArticles);

        const lastVisit = lastVisitRef.current;
        const newIds = new Set(derivedArticles.filter((a) => a.publishedAt > lastVisit).map((a) => a.id));
        setNewSinceLastVisit(newIds);

        const visibleIds = new Set(
          derivedArticles.filter((a) => (Date.now() - a.publishedAt.getTime()) / (1000 * 60 * 60) < 24).map((a) => a.id)
        );
        const previouslySeen = new Set([...visibleIds].filter((id) => !newIds.has(id)));
        setSeenIds(previouslySeen);

        const cache: ArticleSummaryCache = new Map();
        for (const a of derivedArticles) {
          cache.set(a.id, { default: a.summaryDefault });
        }
        setSummaryCache(cache);

        setLoading(false);
        lastVisitRef.current = new Date();
      } catch (err) {
        console.error("Failed to load articles:", err);
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sources.length]);

  // Handle summary mode change — fetch if not already cached
  const handleSummaryModeChange = useCallback(
    async (articleId: string, mode: SummaryMode) => {
      setSummaryModes((prev) => new Map(prev).set(articleId, mode));

      // Default is always available — no fetch needed
      if (mode === "default") return;

      const article = articles.find((a: Article) => a.id === articleId);
      if (!article) return;

      // Check session cache or pre-loaded value from DynamoDB
      const preLoaded = mode === "short" ? article.summaryShort : article.summaryDeepDive;
      const cached = summaryCache.get(articleId)?.[mode];
      if (cached || preLoaded) return;

      // Check if already loading
      const currentLoading = loadingModesByArticle.get(articleId);
      if (currentLoading?.has(mode)) return;

      // Mark as loading
      setLoadingModesByArticle((prev) => {
        const next = new Map(prev);
        const existing = new Set(next.get(articleId) ?? []);
        existing.add(mode);
        next.set(articleId, existing);
        return next;
      });

      try {
        // Map frontend mode to backend prompt key
        const backendMode = mode === "short" ? "shorter" : "longer";

        const res = await fetch("/api/user/url/resummarization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteURL: article.url, websiteContentMode: backendMode }),
        });

        if (!res.ok) throw new Error(`Resummarize failed: ${res.status}`);

        const raw = await res.text();
        const generatedText = extractSummaryText(raw);

        if (generatedText) {
          setSummaryCache((prev) => {
            const next = new Map(prev);
            const existing = next.get(articleId) ?? {};
            next.set(articleId, { ...existing, [mode]: generatedText });
            return next;
          });

          patchArticle(articleId, mode, generatedText);
        }
      } catch (err) {
        console.error("Resummarize error:", err);
        showToast("Failed to generate summary", "error");
      } finally {
        setLoadingModesByArticle((prev) => {
          const next = new Map(prev);
          const existing = new Set(next.get(articleId) ?? []);
          existing.delete(mode);
          next.set(articleId, existing);
          return next;
        });
      }
    },
    [summaryCache, loadingModesByArticle, articles, patchArticle, showToast]
  );

  // Computed stats
  const stats = useMemo(() => {
    const nonExpired = articles.filter((a) => (Date.now() - a.publishedAt.getTime()) / (1000 * 60 * 60) < 24);
    const sourcesWithContent = new Set(nonExpired.map((a) => a.sourceId)).size;
    return { articleCount: nonExpired.length, sourceCount: sourcesWithContent };
  }, [articles]);

  // Flattened article list for Reader view (grouped by source, newest first within each group)
  const flatArticles = useMemo(() => {
    const result: Article[] = [];
    for (const src of sources) {
      const srcArticles = articles
        .filter((a) => a.sourceId === src.id && getAgeState(a, seenIds) !== "expired")
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      result.push(...srcArticles);
    }
    return result;
  }, [articles, sources, seenIds]);

  const articlesBySource = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const src of sources) map.set(src.id, []);
    for (const article of articles) {
      if (!map.has(article.sourceId)) map.set(article.sourceId, []);
      map.get(article.sourceId)!.push(article);
    }
    return map;
  }, [articles, sources]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function toggleBookmark(id: string) {
    const article = articles.find((a) => a.id === id);
    const source = sources.find((s) => s.id === article?.sourceId);
    if (!article || !source) return;
    const alreadyBookmarked = isBookmarked(id);
    if (alreadyBookmarked) {
      const removed = await removeBookmark(article.url);
      if (!removed) {
        showToast("Failed to remove saved article", "error");
      }
      return;
    }

    const mode = summaryModes.get(id) ?? "default";
    const saved = await saveBookmark(article, source, mode);
    if (saved) {
      showToast("Article saved", "success");
    } else {
      showToast("Failed to save article", "error");
    }
  }

  function handleExpandAll() {
    if (allExpanded) {
      setExpandedIds(new Set());
      setAllExpanded(false);
    } else {
      setExpandedIds(new Set(articles.map((a) => a.id)));
      setAllExpanded(true);
    }
  }

  const isCompact = density === "compact";
  const outerPadding = isCompact ? "18px 16px" : "28px 24px";

  // Derive bookmarkedIds Set from global context so Dashboard and Saved stay in sync
  const bookmarkedIds = useMemo(
    () => new Set(appState.bookmarks.map((b) => b.article.id)),
    [appState.bookmarks]
  );

  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
  }, []);

  const [pendingUpdate, setPendingUpdate] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("pendingFeedUpdate") === "true"
  );
  const [updating, setUpdating] = useState(false);

  const handleUpdateFeed = useCallback(async () => {
    setUpdating(true);
    try {
      await fetch("/api/user/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "rohil" }),
      });
      localStorage.removeItem("pendingFeedUpdate");
      setPendingUpdate(false);
      showToast("Feed update started — new articles will appear shortly", "success");
    } catch {
      showToast("Failed to start feed update", "error");
    } finally {
      setUpdating(false);
    }
  }, [showToast]);

  // ── Reader view ──
  if (viewMode === "reader") {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0% { background-position: -400px 0; }
            100% { background-position: 400px 0; }
          }
          .shimmer {
            background: linear-gradient(90deg, var(--sg-border) 25%, var(--sg-surface-hover) 50%, var(--sg-border) 75%);
            background-size: 800px 100%;
            animation: shimmer 1.4s ease-in-out infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        {loading ? (
          <div style={{ padding: outerPadding, display: "flex", flexDirection: "column", gap: 10, maxWidth: 860, margin: "0 auto" }}>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <ReaderView
            articles={flatArticles}
            sources={sources}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={toggleBookmark}
            summaryModes={summaryModes}
            onSummaryModeChange={handleSummaryModeChange}
            loadingModesByArticle={loadingModesByArticle}
            seenIds={seenIds}
            newSinceLastVisit={newSinceLastVisit}
          />
        )}
      </>
    );
  }

  // ── Feed view ──
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, var(--sg-border) 25%, var(--sg-surface-hover) 50%, var(--sg-border) 75%);
          background-size: 800px 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: outerPadding,
          display: "flex",
          flexDirection: "column",
          gap: isCompact ? 20 : 28,
        }}
      >
        {/* Pending feed update banner */}
        {pendingUpdate && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 16px",
              backgroundColor: "var(--sg-accent-subtle)",
              border: "1px solid var(--sg-border)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--sg-text)",
            }}
          >
            <span>You have new sources — update your feed to start seeing articles from them.</span>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={handleUpdateFeed}
                disabled={updating}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--sg-fab-color, #fff)",
                  backgroundColor: "var(--sg-fab-bg, var(--sg-text))",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  cursor: updating ? "not-allowed" : "pointer",
                  opacity: updating ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {updating ? "Updating…" : "Update Feed"}
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("pendingFeedUpdate");
                  setPendingUpdate(false);
                }}
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--sg-muted)",
                  backgroundColor: "transparent",
                  border: "1px solid var(--sg-border)",
                  borderRadius: 6,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Daily Digest Banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 8,
            backgroundColor: "var(--sg-surface)",
            border: "1px solid var(--sg-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar style={{ width: 13, height: 13, color: "var(--sg-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--sg-text)" }}>
              {loading
                ? "Loading your digest…"
                : `${stats.articleCount} articles across ${stats.sourceCount} sources`}
            </span>
            {today && (
              <span style={{ fontSize: 11.5, color: "var(--sg-muted)", fontWeight: 400 }}>
                — {today}
              </span>
            )}
          </div>

          {!loading && articles.length > 0 && (
            <button
              onClick={handleExpandAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11.5,
                fontWeight: 500,
                color: "var(--sg-muted)",
                background: "none",
                border: "1px solid var(--sg-border)",
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                transition: "opacity 0.15s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {allExpanded ? (
                <><ChevronsDownUp style={{ width: 12, height: 12 }} /> Collapse All</>
              ) : (
                <><ChevronsUpDown style={{ width: 12, height: 12 }} /> Expand All</>
              )}
            </button>
          )}
        </div>

        {/* Skeletons */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && sources.length === 0 && (
          <EmptyState onAddSource={() => navigate("/sources")} />
        )}

        {/* Feed grouped by source */}
        {!loading && sources.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: isCompact ? 32 : 44 }}>
            {sources.map((source) => {
              const srcArticles = articlesBySource.get(source.id) ?? [];
              return (
                <SourceGroup
                  key={source.id}
                  source={source}
                  articles={srcArticles}
                  expandedIds={expandedIds}
                  onToggleExpand={toggleExpand}
                  bookmarkedIds={bookmarkedIds}
                  onToggleBookmark={toggleBookmark}
                  seenIds={seenIds}
                  newSinceLastVisit={newSinceLastVisit}
                  summaryModes={summaryModes}
                  onSummaryModeChange={handleSummaryModeChange}
                  loadingModesByArticle={loadingModesByArticle}
                  sourceCollapsed={collapsedSources.has(source.id)}
                  onToggleSourceCollapse={() => setCollapsedSources((prev) => {
                    const next = new Set(prev);
                    next.has(source.id) ? next.delete(source.id) : next.add(source.id);
                    return next;
                  })}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
