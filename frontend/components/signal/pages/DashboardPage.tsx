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
  Tags,
} from "lucide-react";
import {
  type Source,
  type Article,
  type SummaryMode,
  DEFAULT_ACCENT,
} from "../data/mockArticles";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { useAppState, type ManagedSource } from "../context/AppStateContext";
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

function parsePreferredTime(value: string): { hours: number; minutes: number } {
  const match = value.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!match) {
    return { hours: 7, minutes: 0 };
  }

  let hours = Number.parseInt(match[1], 10) % 12;
  const minutes = Number.parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM") {
    hours += 12;
  }

  return { hours, minutes };
}

function setTimeOnDate(base: Date, value: string): Date {
  const { hours, minutes } = parsePreferredTime(value);
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function formatScheduleTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatNextUpdateAvailability(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfTarget = new Date(date);
  startOfTarget.setHours(0, 0, 0, 0);

  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${formatScheduleTime(date)}`;
  }

  if (diffDays === 1) {
    return `Tomorrow at ${formatScheduleTime(date)}`;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLastUpdated(date: Date): string {
  return `${formatHoursAgo(date)} • ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

type AgeState = "new" | "read" | "expired";

function getArticleFreshnessDate(article: Article): Date {
  return article.processedAt;
}

function getAgeState(article: Article, seenIds: Set<string>): AgeState {
  const ageHours = (Date.now() - getArticleFreshnessDate(article).getTime()) / (1000 * 60 * 60);
  if (ageHours >= 24) return "expired";
  if (seenIds.has(article.id)) return "read";
  return "new";
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const KEYWORD_SYNONYMS: Record<string, string[]> = {
  ai: ["artificial intelligence", "machine learning", "ML"],
  "electric vehicles": ["EV", "EVs", "electric vehicle"],
  "autonomous vehicles": ["self-driving", "robotaxi", "driverless"],
  cybersecurity: ["cyber security", "infosec", "data breach"],
  startups: ["startup", "start-up"],
};

type KeywordArticleMatch = {
  matchedKeyword: string;
  matchedTerms: string[];
  score: number;
};

const KEYWORD_VISIBLE_ARTICLE_LIMIT = 8;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWholeWordRegex(value: string): RegExp {
  return new RegExp(`\\b${escapeRegex(value)}\\b`, "gi");
}

function countWholeWordMatches(text: string, value: string): number {
  if (!text.trim() || !value.trim()) return 0;
  const matches = text.match(buildWholeWordRegex(value));
  return matches ? matches.length : 0;
}

function getKeywordVariants(keyword: string): string[] {
  const normalized = normalizeKeyword(keyword);
  const synonyms = KEYWORD_SYNONYMS[normalized.toLowerCase()] ?? [];

  return Array.from(
    new Set([normalized, ...synonyms.map(normalizeKeyword)].filter(Boolean))
  );
}

function scoreArticleForKeyword(article: Article, keyword: string): KeywordArticleMatch | null {
  const variants = getKeywordVariants(keyword);
  let score = 0;
  const matchedTerms: string[] = [];

  for (const variant of variants) {
    const titleMatches = countWholeWordMatches(article.title, variant);
    const summaryMatches = countWholeWordMatches(article.summaryDefault, variant);

    if (titleMatches === 0 && summaryMatches === 0) {
      continue;
    }

    matchedTerms.push(variant);

    if (titleMatches > 0) {
      score += 5;
    }

    score += summaryMatches;
  }

  if (score === 0) {
    return null;
  }

  return {
    matchedKeyword: keyword,
    matchedTerms,
    score,
  };
}

function getVisibleKeywordArticleMatches(
  articles: Article[],
  keyword: string
): Array<{ article: Article; match: KeywordArticleMatch }> {
  const rankedMatches = articles
    .filter((article) => (Date.now() - getArticleFreshnessDate(article).getTime()) / (1000 * 60 * 60) < 24)
    .map((article) => ({
      article,
      match: scoreArticleForKeyword(article, keyword),
    }))
    .filter((entry): entry is { article: Article; match: KeywordArticleMatch } => entry.match !== null)
    .sort((left, right) => {
      if (right.match.score !== left.match.score) {
        return right.match.score - left.match.score;
      }
      return right.article.publishedAt.getTime() - left.article.publishedAt.getTime();
    });

  const visibleMatches: Array<{ article: Article; match: KeywordArticleMatch }> = [];
  const seenArticleIds = new Set<string>();

  for (const entry of rankedMatches) {
    if (seenArticleIds.has(entry.article.id)) {
      continue;
    }

    seenArticleIds.add(entry.article.id);
    visibleMatches.push(entry);

    if (visibleMatches.length >= KEYWORD_VISIBLE_ARTICLE_LIMIT) {
      break;
    }
  }

  return visibleMatches;
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
  matchLabel?: string | null;
  onTrackLinkClick: () => void;
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
  matchLabel,
  onTrackLinkClick,
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
              onClick={onTrackLinkClick}
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

        {matchLabel && (
          <div style={{ paddingLeft: 36, marginTop: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--sg-muted)",
                backgroundColor: "var(--sg-nav-active)",
                border: "1px solid var(--sg-border)",
                borderRadius: 999,
                padding: "4px 8px",
              }}
            >
              Matched: {matchLabel}
            </span>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, paddingLeft: 36 }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onTrackLinkClick}
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
  matchLabelsByArticle?: Map<string, string>;
  onTrackLinkClick: (articleId: string) => void;
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
  matchLabelsByArticle,
  onTrackLinkClick,
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
              matchLabel={matchLabelsByArticle?.get(article.id) ?? null}
              onTrackLinkClick={() => onTrackLinkClick(article.id)}
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
  onTrackLinkClick: (articleId: string) => void;
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
  onTrackLinkClick,
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
            onClick={() => onTrackLinkClick(article.id)}
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
            onClick={() => onTrackLinkClick(article.id)}
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

type DashboardMode = "default" | "keyword";

type DashboardArticleFields = {
  date: string;
  processedAt: string;
  link: string;
  summaryDefault: string;
  summaryShort: string;
  summaryLong: string;
};

type DashboardWebsiteResponse = Record<
  string,
  {
    siteName: string | null;
    paywall: string | null;
    articles: Array<Record<string, DashboardArticleFields>>;
  }
>;

type DashboardFeedSnapshot = {
  sources: Source[];
  articles: Article[];
  articleCount: number;
  lastProcessedAtMs: number | null;
};

type FeedPollState = {
  startedAtMs: number;
  baselineArticleCount: number;
  baselineLastProcessedAtMs: number | null;
};

const DASHBOARD_MODES: { key: DashboardMode; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "keyword", label: "Keyword" },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { density, viewMode, preferredUpdateTime } = usePreferences();
  const { authenticatedFetch, user } = useAuth();
  const { state: appState, saveBookmark, removeBookmark, isBookmarked, addSource, setArticles, patchArticleSummary: patchArticle, trackArticleInteraction } = useAppState();
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
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("default");
  const [feedPollState, setFeedPollState] = useState<FeedPollState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadKeywords() {
      try {
        const res = await authenticatedFetch("/api/user/keywords");
        if (!res.ok) return;

        const payload = (await res.json()) as string[];
        if (cancelled) return;

        const nextKeywords = Array.from(
          new Set((Array.isArray(payload) ? payload : []).map(normalizeKeyword).filter(Boolean))
        );

        setKeywords(nextKeywords);
      } catch (error) {
        console.error("Failed to load keywords:", error);
      }
    }

    void loadKeywords();

    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch]);

  useEffect(() => {
    if (dashboardMode !== "keyword") {
      return;
    }

    setSelectedKeyword((current) => {
      if (keywords.length === 0) return null;
      if (current && keywords.includes(current)) return current;
      return keywords[0];
    });
  }, [dashboardMode, keywords]);

  const fetchDashboardSnapshot = useCallback(async (): Promise<DashboardFeedSnapshot> => {
    const res = await authenticatedFetch("/api/user/website");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Backend error ${res.status}: ${text}`);
    }

    const response = await res.json() as DashboardWebsiteResponse;

    const derivedSources: Source[] = await Promise.all(
      Object.keys(response).map(async (sourceUrl) => {
        const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
        const existingSource = sources.find((source) => source.id === sourceUrl);

        let faviconUrl = existingSource?.faviconUrl ?? `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
        let accentColor = existingSource?.accentColor ?? DEFAULT_ACCENT;

        if (!existingSource) {
          try {
            const fav = await fetch(`/api/favicon?domain=${hostname}`).then((r) => r.json()) as { faviconUrl: string; color: string };
            faviconUrl = fav.faviconUrl;
            accentColor = fav.color;
          } catch {}
        }

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
            processedAt: new Date(fields.processedAt),
            originalWordCount: 0,
            summaryWordCount: (extractSummaryText(fields.summaryDefault) ?? "")
              .split(/\s+/)
              .filter(Boolean)
              .length,
          }))
        )
    );

    const lastProcessedAtMs = derivedArticles.reduce<number | null>((latest, article) => {
      const current = getArticleFreshnessDate(article).getTime();
      if (latest === null || current > latest) {
        return current;
      }
      return latest;
    }, null);

    return {
      sources: derivedSources,
      articles: derivedArticles,
      articleCount: derivedArticles.length,
      lastProcessedAtMs,
    };
  }, [authenticatedFetch, sources]);

  const applyDashboardSnapshot = useCallback((snapshot: DashboardFeedSnapshot) => {
    snapshot.sources.forEach((source) => addSource(source));
    setArticles(snapshot.articles);

    const lastVisit = lastVisitRef.current;
    const nextNewIds = new Set(
      snapshot.articles
        .filter((article) => getArticleFreshnessDate(article) > lastVisit)
        .map((article) => article.id)
    );
    setNewSinceLastVisit(nextNewIds);

    const visibleIds = new Set(
      snapshot.articles
        .filter((article) => (Date.now() - getArticleFreshnessDate(article).getTime()) / (1000 * 60 * 60) < 24)
        .map((article) => article.id)
    );
    const nextSeenIds = new Set([...visibleIds].filter((id) => !nextNewIds.has(id)));
    setSeenIds(nextSeenIds);

    setSummaryCache((previousCache) => {
      const nextCache: ArticleSummaryCache = new Map();
      for (const article of snapshot.articles) {
        nextCache.set(article.id, {
          ...previousCache.get(article.id),
          default: article.summaryDefault,
        });
      }
      return nextCache;
    });

    lastVisitRef.current = new Date();
  }, [addSource, setArticles]);

  // Fetch / load data
  useEffect(() => {
    if (sources.length > 0) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const snapshot = await fetchDashboardSnapshot();
        if (cancelled) return;
        applyDashboardSnapshot(snapshot);
      } catch (err) {
        console.error("Failed to load articles:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [applyDashboardSnapshot, fetchDashboardSnapshot, sources.length]);

  // Handle summary mode change — fetch if not already cached
  const handleSummaryModeChange = useCallback(
    async (articleId: string, mode: SummaryMode) => {
      const previousMode = summaryModes.get(articleId) ?? "default";
      setSummaryModes((prev) => new Map(prev).set(articleId, mode));

      const currentArticle = articles.find((article) => article.id === articleId);
      if (currentArticle && mode === "deepDive" && previousMode !== "deepDive") {
        trackArticleInteraction(currentArticle, "deep_dive_click");
      }

      // Default is always available — no fetch needed
      if (mode === "default") return;

      const article = currentArticle;
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

        const res = await authenticatedFetch("/api/user/url/resummarization", {
          method: "POST",
          body: JSON.stringify({ websiteURL: article.sourceId, articleLink: article.url, websiteContentMode: backendMode }),
        });

        if (!res.ok) throw new Error(`Resummarize failed: ${res.status}`);

        const raw = await res.text();
        const generatedText = extractSummaryText(raw);

        console.log("[signal] resummarize response", {
          articleId,
          articleTitle: article.title,
          articleUrl: article.url,
          mode,
          backendMode,
          raw,
          extractedText: generatedText,
          extractedLength: generatedText?.length ?? 0,
        });

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
    [authenticatedFetch, summaryCache, loadingModesByArticle, articles, patchArticle, showToast, trackArticleInteraction]
  );

  // Computed stats
  const keywordRankedArticles = useMemo(() => {
    if (dashboardMode !== "keyword" || !selectedKeyword) {
      return [];
    }

    return getVisibleKeywordArticleMatches(articles, selectedKeyword);
  }, [articles, dashboardMode, selectedKeyword]);

  const filteredArticles = useMemo(() => {
    const nonExpired = articles.filter((a) => (Date.now() - getArticleFreshnessDate(a).getTime()) / (1000 * 60 * 60) < 24);
    if (dashboardMode !== "keyword") return nonExpired;
    return keywordRankedArticles.map((entry) => entry.article);
  }, [articles, dashboardMode, keywordRankedArticles]);

  const matchLabelsByArticle = useMemo(() => {
    if (dashboardMode !== "keyword") {
      return new Map<string, string>();
    }

    return new Map(
      keywordRankedArticles.map(({ article, match }) => [article.id, match.matchedKeyword])
    );
  }, [dashboardMode, keywordRankedArticles]);

  const visibleSources = useMemo<ManagedSource[]>(() => {
    if (dashboardMode !== "keyword") {
      const sourceIds = new Set(filteredArticles.map((article) => article.sourceId));
      return sources.filter((source) => sourceIds.has(source.id));
    }

    const orderedSourceIds = Array.from(new Set(filteredArticles.map((article) => article.sourceId)));
    const orderedSources: ManagedSource[] = [];

    for (const sourceId of orderedSourceIds) {
      const source = sources.find((candidate) => candidate.id === sourceId);
      if (source) {
        orderedSources.push(source);
      }
    }

    return orderedSources;
  }, [dashboardMode, filteredArticles, sources]);

  const stats = useMemo(() => {
    const nonExpired = filteredArticles;
    const sourcesWithContent = new Set(nonExpired.map((a) => a.sourceId)).size;
    return { articleCount: nonExpired.length, sourceCount: sourcesWithContent };
  }, [filteredArticles]);

  // Flattened article list for Reader view (grouped by source, newest first within each group)
  const flatArticles = useMemo(() => {
    const result: Article[] = [];
    for (const src of visibleSources) {
      const srcArticles = filteredArticles
        .filter((a) => a.sourceId === src.id && getAgeState(a, seenIds) !== "expired")
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      result.push(...srcArticles);
    }
    return result;
  }, [filteredArticles, visibleSources, seenIds]);

  const articlesBySource = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const src of visibleSources) map.set(src.id, []);
    for (const article of filteredArticles) {
      if (!map.has(article.sourceId)) map.set(article.sourceId, []);
      map.get(article.sourceId)!.push(article);
    }
    return map;
  }, [filteredArticles, visibleSources]);

  const keywordCounts = useMemo(
    () =>
      keywords.map((keyword) => ({
        keyword,
        count: getVisibleKeywordArticleMatches(articles, keyword).length,
      })),
    [articles, keywords]
  );

  function toggleExpand(id: string) {
    const article = articles.find((entry) => entry.id === id);
    const isOpening = !expandedIds.has(id);
    if (article && isOpening) {
      trackArticleInteraction(article, "article_click");
    }

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
    trackArticleInteraction(article, "bookmark_click");
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

  const handleLinkClick = useCallback(
    (articleId: string) => {
      const article = articles.find((entry) => entry.id === articleId);
      if (article) {
        trackArticleInteraction(article, "link_click");
      }
    },
    [articles, trackArticleInteraction]
  );

  function handleExpandAll() {
    if (allExpanded) {
      setExpandedIds(new Set());
      setAllExpanded(false);
    } else {
      setExpandedIds(new Set(filteredArticles.map((a) => a.id)));
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

  const pendingFeedUpdateStorageKey = user ? `signal.pendingFeedUpdate:${user.username}` : "";
  const lastFeedUpdateRequestStorageKey = user ? `signal.lastFeedUpdateRequest:${user.username}` : "";
  const [pendingUpdate, setPendingUpdate] = useState(false);
  const [lastFeedUpdateRequestAt, setLastFeedUpdateRequestAt] = useState<Date | null>(null);
  const [updating, setUpdating] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === "undefined" || !user) {
      setPendingUpdate(false);
      setLastFeedUpdateRequestAt(null);
      return;
    }

    setPendingUpdate(window.localStorage.getItem(pendingFeedUpdateStorageKey) === "true");

    const rawLastRequestedAt = window.localStorage.getItem(lastFeedUpdateRequestStorageKey);
    if (!rawLastRequestedAt) {
      setLastFeedUpdateRequestAt(null);
      return;
    }

    const parsed = new Date(rawLastRequestedAt);
    setLastFeedUpdateRequestAt(Number.isNaN(parsed.getTime()) ? null : parsed);
  }, [lastFeedUpdateRequestStorageKey, pendingFeedUpdateStorageKey, user]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  const lastFeedUpdatedAt = useMemo(() => {
    if (articles.length === 0) return null;

    return articles.reduce<Date | null>((latest, article) => {
      const current = getArticleFreshnessDate(article);
      if (!latest || current > latest) {
        return current;
      }
      return latest;
    }, null);
  }, [articles]);

  const lastFeedDisplayAt = useMemo(
    () => lastFeedUpdatedAt ?? lastFeedUpdateRequestAt,
    [lastFeedUpdateRequestAt, lastFeedUpdatedAt]
  );
  const isFeedRefreshing = updating || feedPollState !== null;

  const feedUpdateStatus = useMemo(() => {
    if (sources.length === 0) {
      return null;
    }

    const now = new Date(currentTimeMs);
    const todayPreferredTime = setTimeOnDate(now, preferredUpdateTime);
    const nextScheduledUpdate = now < todayPreferredTime
      ? todayPreferredTime
      : setTimeOnDate(new Date(now.getTime() + 24 * 60 * 60 * 1000), preferredUpdateTime);

    const canBootstrapFeed = articles.length === 0 && lastFeedUpdateRequestAt === null;
    const nextUpdateLabel = `Next update available ${formatNextUpdateAvailability(nextScheduledUpdate)}.`;

    if (isFeedRefreshing) {
      return {
        kind: "progress" as const,
        label: "Updating feed…",
        title: "Fetching the latest briefing. New articles will appear automatically when the update finishes.",
      };
    }

    if (canBootstrapFeed) {
      return {
        kind: "button" as const,
        label: "Update Feed",
        title: pendingUpdate
          ? "You added sources. Generate the first daily briefing when you're ready."
          : "Generate your first daily briefing to start populating the feed.",
      };
    }

    if (!lastFeedUpdateRequestAt || lastFeedUpdateRequestAt < todayPreferredTime) {
      if (now >= todayPreferredTime) {
        return {
          kind: "button" as const,
          label: "Update Feed",
          title: pendingUpdate
            ? "You added sources. Update the feed to roll them into today's briefing."
            : "Update the feed when you're ready for today's recap.",
        };
      }

      return {
        kind: "status" as const,
        label: lastFeedDisplayAt
          ? `Last updated ${formatLastUpdated(lastFeedDisplayAt)}`
          : `Next update ${formatNextUpdateAvailability(nextScheduledUpdate)}`,
        title: pendingUpdate
          ? `New sources are queued for the next scheduled briefing. ${nextUpdateLabel}`
          : `Your feed is set to refresh on the daily schedule. ${nextUpdateLabel}`,
      };
    }

    return {
      kind: "status" as const,
      label: lastFeedDisplayAt
        ? `Last updated ${formatLastUpdated(lastFeedDisplayAt)}`
        : `Next update ${formatNextUpdateAvailability(nextScheduledUpdate)}`,
      title: pendingUpdate
        ? `New sources are queued for the next scheduled briefing. ${nextUpdateLabel}`
        : nextUpdateLabel,
    };
  }, [articles.length, currentTimeMs, isFeedRefreshing, lastFeedDisplayAt, lastFeedUpdateRequestAt, pendingUpdate, preferredUpdateTime, sources.length]);

  const handleUpdateFeed = useCallback(async () => {
    setUpdating(true);
    try {
      const response = await authenticatedFetch("/api/user/task", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Feed update failed (${response.status})`);
      }
      const requestedAt = new Date();
      localStorage.removeItem(pendingFeedUpdateStorageKey);
      localStorage.setItem(lastFeedUpdateRequestStorageKey, requestedAt.toISOString());
      setPendingUpdate(false);
      setLastFeedUpdateRequestAt(requestedAt);
      setFeedPollState({
        startedAtMs: requestedAt.getTime(),
        baselineArticleCount: articles.length,
        baselineLastProcessedAtMs: lastFeedUpdatedAt?.getTime() ?? null,
      });
      showToast("Feed update started — new articles will appear shortly", "success");
    } catch {
      showToast("Failed to start feed update", "error");
    } finally {
      setUpdating(false);
    }
  }, [articles.length, authenticatedFetch, lastFeedUpdateRequestStorageKey, lastFeedUpdatedAt, pendingFeedUpdateStorageKey, showToast]);

  useEffect(() => {
    if (!feedPollState) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const pollForFeedChanges = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const snapshot = await fetchDashboardSnapshot();
        if (cancelled) {
          return;
        }

        const feedChanged =
          snapshot.articleCount !== feedPollState.baselineArticleCount ||
          (snapshot.lastProcessedAtMs !== null &&
            (feedPollState.baselineLastProcessedAtMs === null ||
              snapshot.lastProcessedAtMs > feedPollState.baselineLastProcessedAtMs));

        if (feedChanged) {
          applyDashboardSnapshot(snapshot);
          setFeedPollState(null);
          showToast("Feed updated", "success");
          return;
        }

        if (Date.now() - feedPollState.startedAtMs >= 5 * 60 * 1000) {
          setFeedPollState(null);
          showToast("Feed update is taking longer than expected. Check back in a few minutes.", "info");
        }
      } catch (error) {
        console.error("Failed to refresh dashboard feed:", error);
      } finally {
        inFlight = false;
      }
    };

    const initialTimeoutId = window.setTimeout(() => {
      void pollForFeedChanges();
    }, 4000);

    const intervalId = window.setInterval(() => {
      void pollForFeedChanges();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [applyDashboardSnapshot, feedPollState, fetchDashboardSnapshot, showToast]);

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
          <div style={{ padding: outerPadding, display: "flex", flexDirection: "column", gap: 14, maxWidth: 860, margin: "0 auto" }}>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <ReaderView
              articles={flatArticles}
              sources={visibleSources}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={toggleBookmark}
              onTrackLinkClick={handleLinkClick}
              summaryModes={summaryModes}
              onSummaryModeChange={handleSummaryModeChange}
              loadingModesByArticle={loadingModesByArticle}
              seenIds={seenIds}
              newSinceLastVisit={newSinceLastVisit}
            />
          </div>
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {DASHBOARD_MODES.map(({ key, label }) => {
            const isActive = dashboardMode === key;
            return (
              <button
                key={key}
                onClick={() => setDashboardMode(key)}
                aria-pressed={isActive}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--sg-border)",
                  backgroundColor: "var(--sg-surface)",
                  color: "var(--sg-text)",
                  fontSize: 12.5,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                {label}
              </button>
            );
          })}

          {feedUpdateStatus && (
            <div
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {feedUpdateStatus.kind === "button" ? (
                <button
                  onClick={handleUpdateFeed}
                  disabled={updating}
                  title={feedUpdateStatus.title}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--sg-border)",
                    backgroundColor: "var(--sg-surface)",
                    color: "var(--sg-text)",
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: updating ? "not-allowed" : "pointer",
                    opacity: updating ? 0.7 : 1,
                    transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {feedUpdateStatus.label}
                </button>
              ) : feedUpdateStatus.kind === "progress" ? (
                <span
                  title={feedUpdateStatus.title}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--sg-border)",
                    backgroundColor: "var(--sg-surface)",
                    color: "var(--sg-text)",
                    fontSize: 12.5,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                  {feedUpdateStatus.label}
                </span>
              ) : (
                <span
                  title={feedUpdateStatus.title}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--sg-border)",
                    backgroundColor: "var(--sg-surface)",
                    color: "var(--sg-text)",
                    fontSize: 12.5,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  {feedUpdateStatus.label}
                </span>
              )}
            </div>
          )}
        </div>

        {dashboardMode === "keyword" && keywordCounts.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 2 }}>
              <Tags style={{ width: 13, height: 13, color: "var(--sg-muted)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sg-muted)" }}>
                Keywords
              </span>
            </div>

            {keywordCounts.map(({ keyword, count }) => (
              <button
                key={keyword}
                onClick={() => setSelectedKeyword(keyword)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: count > 9 ? "8px 14px" : "6px 12px",
                  borderRadius: 999,
                  border: selectedKeyword === keyword ? "1px solid var(--sg-text)" : "1px solid var(--sg-border)",
                  backgroundColor: selectedKeyword === keyword ? "var(--sg-nav-active)" : "var(--sg-surface)",
                  color: "var(--sg-text)",
                  fontSize: 12.5,
                  fontWeight: selectedKeyword === keyword ? 700 : 500,
                  cursor: "pointer",
                  boxShadow: selectedKeyword === keyword ? "0 2px 10px rgba(0,0,0,0.06)" : "none",
                  transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                {keyword}
                <span style={{ fontSize: 11, color: "var(--sg-muted)" }}>{count}</span>
              </button>
            ))}
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
                : dashboardMode !== "keyword"
                  ? `${stats.articleCount} articles across ${stats.sourceCount} sources`
                  : selectedKeyword
                    ? `${stats.articleCount} visible articles across ${stats.sourceCount} sources for "${selectedKeyword}" within the last 24 hours`
                    : "Choose a keyword to focus your feed"}
            </span>
            {today && (
              <span style={{ fontSize: 11.5, color: "var(--sg-muted)", fontWeight: 400 }}>
                — {today}
              </span>
            )}
          </div>

          {!loading && filteredArticles.length > 0 && (
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

        {!loading && dashboardMode === "keyword" && keywords.length === 0 && sources.length > 0 && (
          <div
            style={{
              padding: "22px 20px",
              borderRadius: 10,
              border: "1px solid var(--sg-border)",
              backgroundColor: "var(--sg-surface)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sg-text)" }}>
              No keywords set up yet.
            </div>
            <div style={{ fontSize: 12.5, color: "var(--sg-muted)", marginTop: 4, lineHeight: 1.6 }}>
              Add keywords in Settings, then come back here to focus the feed on a specific topic.
            </div>
          </div>
        )}

        {!loading && sources.length > 0 && filteredArticles.length === 0 && !(dashboardMode === "keyword" && keywords.length === 0) && (
          <div
            style={{
              padding: "22px 20px",
              borderRadius: 10,
              border: "1px solid var(--sg-border)",
              backgroundColor: "var(--sg-surface)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sg-text)" }}>
              No current articles match {dashboardMode === "keyword" && selectedKeyword ? `"${selectedKeyword}"` : "this view"}.
            </div>
            <div style={{ fontSize: 12.5, color: "var(--sg-muted)", marginTop: 4, lineHeight: 1.6 }}>
              {dashboardMode === "keyword"
                ? "Try another keyword or adjust your keywords in Settings."
                : "No articles are currently available in this view."}
            </div>
          </div>
        )}

        {/* Feed grouped by source */}
        {!loading && visibleSources.length > 0 && filteredArticles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: isCompact ? 32 : 44 }}>
            {visibleSources.map((source) => {
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
                  matchLabelsByArticle={dashboardMode === "keyword" ? matchLabelsByArticle : undefined}
                  onTrackLinkClick={handleLinkClick}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
