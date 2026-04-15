"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Bookmark,
  BookmarkX,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useAppState, type BookmarkedArticle } from "../context/AppStateContext";
import { useToast } from "../context/ToastContext";
import { usePreferences } from "../context/PreferencesContext";
import { DEFAULT_ACCENT, type SummaryMode } from "../data/mockArticles";

// ─── Utilities (same as Dashboard) ───────────────────────────────────────────

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

function splitShortSummary(summary: string): string[] {
  return summary
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])\s+(?=(?:[-•*]\s)|(?:\d+\.\s))/g, "$1\n")
    .split("\n")
    .map((line) => line.trim().replace(/^[-•*\d.)\s]+/, ""))
    .filter(Boolean);
}

// ─── Favicon Bubble ───────────────────────────────────────────────────────────

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
      crossOrigin="anonymous"
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

// ─── Summary Mode Toggle ──────────────────────────────────────────────────────

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
}: {
  items: string[];
  accentColor: string;
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
              opacity: 0.8,
              flexShrink: 0,
              marginTop: 6,
            }}
          />
          <span
            style={{
              fontSize: 13,
              color: "var(--sg-text)",
              opacity: 0.88,
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

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "source";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "source", label: "By website" },
];

// ─── Saved Article Card ───────────────────────────────────────────────────────

function SavedCard({
  bookmark,
  onUnbookmark,
  onTrackInteraction,
}: {
  bookmark: BookmarkedArticle;
  onUnbookmark: () => void;
  onTrackInteraction: (type: "bookmark_click" | "deep_dive_click" | "link_click") => void;
}) {
  const { article, source } = bookmark;
  const accent = source.accentColor ?? DEFAULT_ACCENT;
  const [removing, setRemoving] = useState(false);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>(bookmark.summaryMode ?? "default");
  const [loadingModes] = useState<Set<SummaryMode>>(new Set());

  // Animate-out then call parent
  const handleUnbookmark = () => {
    onTrackInteraction("bookmark_click");
    setRemoving(true);
    setTimeout(onUnbookmark, 220);
  };

  function getActiveSummary(): string | null {
    if (summaryMode === "short") return article.summaryShort;
    if (summaryMode === "deepDive") return article.summaryDeepDive;
    return article.summaryDefault;
  }

  const activeSummary = getActiveSummary();
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
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        overflow: "hidden",
        opacity: removing ? 0 : 1,
        transform: removing ? "scale(0.97)" : "scale(1)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
    >
      {/* Left accent stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          backgroundColor: accent,
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
              <span style={{ fontSize: 11, color: accent, fontWeight: 600 }}>{source.name}</span>
              <span style={{ fontSize: 11, color: "var(--sg-border)" }}>·</span>
              <span style={{ fontSize: 11, color: "var(--sg-muted)" }}>
                {formatHoursAgo(article.publishedAt)}
              </span>
              <span style={{ fontSize: 11, color: "var(--sg-border)" }}>·</span>
              <span style={{ fontSize: 11, color: "var(--sg-muted)" }}>
                {estimateReadTime(article.originalWordCount)}
              </span>
              <span style={{ fontSize: 11, color: "var(--sg-border)" }}>·</span>
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--sg-muted)",
                  opacity: 0.8,
                  fontFamily: "var(--font-jetbrains-mono, monospace)",
                }}
              >
                {formatNumber(article.originalWordCount)} → {formatNumber(article.summaryWordCount)} words
              </span>
            </div>

            {/* Title */}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onTrackInteraction("link_click")}
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--sg-text)",
                lineHeight: 1.45,
                letterSpacing: "-0.1px",
                textDecoration: "none",
                marginBottom: 2,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = "underline")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = "none")}
            >
              {article.title}
            </a>
          </div>

          {/* Right-side actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, paddingTop: 2 }}>
            <button
              onClick={handleUnbookmark}
              aria-label="Remove bookmark"
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
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.08)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
            >
              <Bookmark
                style={{
                  width: 14,
                  height: 14,
                  fill: accent,
                  stroke: accent,
                  transition: "fill 0.15s ease, stroke 0.15s ease",
                }}
              />
            </button>

          </div>
        </div>

        <div style={{ paddingLeft: 36, marginTop: 10 }}>
          <SummaryModeToggle
            activeMode={summaryMode}
            onSelect={(mode) => {
              if (mode === "deepDive" && summaryMode !== "deepDive") {
                onTrackInteraction("deep_dive_click");
              }
              setSummaryMode(mode);
            }}
            accentColor={accent}
            loadingModes={loadingModes}
          />
        </div>

        <div style={{ paddingLeft: 36, marginTop: 10 }}>
          {summaryMode === "short" && shortSummaryLines.length > 0 ? (
            <CompactBulletList items={shortSummaryLines} accentColor={accent} />
          ) : activeSummary ? (
            <p style={{ fontSize: 13, color: "var(--sg-text)", opacity: 0.88, lineHeight: 1.68, margin: 0 }}>
              {activeSummary}
            </p>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--sg-muted)", fontStyle: "italic", margin: 0 }}>
              Summary not available for this mode.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, paddingLeft: 36 }}>
          <span style={{ fontSize: 11, color: "var(--sg-muted)", opacity: 0.7 }}>
            Saved {formatHoursAgo(bookmark.savedAt)}
          </span>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onTrackInteraction("link_click")}
            style={{
              fontSize: 11,
              color: "var(--sg-muted)",
              display: "flex",
              alignItems: "center",
              gap: 3,
              textDecoration: "none",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = accent)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--sg-muted)")}
          >
            <ExternalLink style={{ width: 10, height: 10 }} />
            Read original
          </a>
        </div>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SavedPage() {
  const { state, removeBookmark, trackArticleInteraction } = useAppState();
  const { showToast } = useToast();
  const { density } = usePreferences();
  const isCompact = density === "compact";
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const sorted = useMemo(() => {
    const list = [...state.bookmarks];
    if (sortKey === "newest") return list.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
    if (sortKey === "oldest") return list.sort((a, b) => a.savedAt.getTime() - b.savedAt.getTime());
    return list.sort((a, b) => a.source.name.localeCompare(b.source.name));
  }, [state.bookmarks, sortKey]);

  const handleUnbookmark = useCallback(
    async (bm: BookmarkedArticle) => {
      const removed = await removeBookmark(bm.article.url);
      if (removed) {
        showToast(`Removed "${bm.article.title.slice(0, 40)}…"`, "info");
      } else {
        showToast("Failed to remove saved article", "error");
      }
    },
    [removeBookmark, showToast]
  );

  const isEmpty = state.bookmarks.length === 0;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: isCompact ? "20px 16px" : "28px 24px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: isCompact ? "18px" : "24px",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--sg-text)", letterSpacing: "-0.3px" }}>
            Saved
          </h2>
          <p style={{ fontSize: 13, color: "var(--sg-muted)", marginTop: 4 }}>
            {state.bookmarks.length} bookmarked article{state.bookmarks.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Sort selector */}
        {!isEmpty && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--sg-muted)" }}>Sort:</span>
            <div
              style={{
                display: "inline-flex",
                backgroundColor: "var(--sg-surface-hover)",
                border: "1px solid var(--sg-border)",
                borderRadius: 7,
                overflow: "hidden",
              }}
            >
              {SORT_OPTIONS.map((opt) => {
                const isActive = sortKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSortKey(opt.key)}
                    style={{
                      fontSize: 11.5,
                      fontWeight: isActive ? 600 : 400,
                      padding: "5px 10px",
                      border: "none",
                      cursor: "pointer",
                      backgroundColor: isActive ? "var(--sg-nav-active)" : "transparent",
                      color: isActive ? "var(--sg-text)" : "var(--sg-muted)",
                      transition: "background-color 0.12s ease, color 0.12s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "64px 32px",
            textAlign: "center",
            border: "1px dashed var(--sg-border)",
            borderRadius: 10,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: "var(--sg-accent-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <BookmarkX style={{ width: 28, height: 28, color: "var(--sg-text)", opacity: 0.45 }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--sg-text)", marginBottom: 6, letterSpacing: "-0.2px" }}>
            No saved articles
          </h3>
          <p style={{ fontSize: 13.5, color: "var(--sg-muted)", lineHeight: 1.6, maxWidth: 260 }}>
            Bookmark articles from your feed to read them later
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: isCompact ? 8 : 10 }}>
          {sorted.map((bm) => (
            <SavedCard
              key={bm.article.id}
              bookmark={bm}
              onUnbookmark={() => handleUnbookmark(bm)}
              onTrackInteraction={(type) => trackArticleInteraction(bm.article, type)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
