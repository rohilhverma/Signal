"use client";

// ─── Search ────────────────────────────────────────────────────────────────────
//
// Self-contained, same shape as HotTopicsView and StatsPage: its own fetch, its own
// state, mounted in one conditional block in DashboardPage. Renders through the same
// `renderArticle` callback HotTopicsView uses, so a result looks and behaves exactly
// like an article anywhere else in the app - same expand, bookmark, summary-mode
// controls - without this file knowing what an article card looks like.
//
// This is NOT archive search. GET /api/user/search only reaches whatever the 7-day
// retention window still holds - see ArticleRetention on the backend - so a query for
// something read a month ago will come back empty. There is no "not in the archive"
// distinction to surface here because there is no archive; the empty state just says
// no matches.

import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";

import type { Article } from "../data/mockArticles";
import { useAuth } from "../context/AuthContext";
import { extractSummaryText } from "../lib/summaryText";

type SearchResultFields = {
  link: string;
  websiteURL: string;
  title: string;
  summaryShort: string | null;
  summaryDefault: string | null;
  summaryLong: string | null;
  publishedAt: string;
  processedAt: string;
  wordCount: number;
};

/** How long to wait after typing stops before firing the request. */
const DEBOUNCE_MS = 350;
/** Below this, the backend itself declines to search — matched here to skip the trip. */
const MIN_QUERY_LENGTH = 2;

function toArticle(item: SearchResultFields): Article {
  const summaryDefault = extractSummaryText(item.summaryDefault) ?? "";
  return {
    id: item.link,
    // Bare domain, matching the sourceId convention every other view derives the
    // same way from /user/website.
    sourceId: item.websiteURL,
    title: item.title,
    url: item.link,
    summaryShort: extractSummaryText(item.summaryShort),
    summaryDefault,
    summaryDeepDive: extractSummaryText(item.summaryLong),
    publishedAt: new Date(item.publishedAt),
    processedAt: new Date(item.processedAt),
    originalWordCount: item.wordCount,
    summaryWordCount: summaryDefault.split(/\s+/).filter(Boolean).length,
  };
}

type Props = {
  renderArticle: (article: Article, matchLabel: string) => React.ReactNode;
};

export function SearchPage({ renderArticle }: Props) {
  const { authenticatedFetch } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    setFailed(false);
    // Guards against an earlier, slower request landing after a later one - typing
    // "ai" then "air" must not let "ai"'s response overwrite "air"'s results.
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const res = await authenticatedFetch(`/api/user/search?q=${encodeURIComponent(trimmed)}`);
        if (requestIdRef.current !== requestId) return;
        if (!res.ok) {
          setFailed(true);
          setLoading(false);
          return;
        }
        const payload = (await res.json()) as SearchResultFields[];
        setResults(Array.isArray(payload) ? payload.map(toArticle) : []);
        setLoading(false);
      } catch {
        if (requestIdRef.current === requestId) {
          setFailed(true);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, authenticatedFetch]);

  const trimmed = query.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ position: "relative" }}>
        <SearchIcon
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 15,
            height: 15,
            color: "var(--sg-muted)",
          }}
        />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the last 7 days of articles…"
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px 10px 34px",
            borderRadius: 8,
            border: "1px solid var(--sg-border)",
            backgroundColor: "var(--sg-surface)",
            color: "var(--sg-text)",
            fontSize: 14,
            outline: "none",
          }}
        />
      </div>

      {trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH && (
        <p style={{ fontSize: 12.5, color: "var(--sg-muted)", margin: 0 }}>Keep typing…</p>
      )}

      {failed && (
        <p style={{ fontSize: 12.5, color: "var(--sg-muted)", margin: 0 }}>
          Search failed. Try again in a moment.
        </p>
      )}

      {loading && !failed && (
        <p style={{ fontSize: 12.5, color: "var(--sg-muted)", margin: 0 }}>Searching…</p>
      )}

      {!loading && !failed && trimmed.length >= MIN_QUERY_LENGTH && results.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--sg-muted)", margin: 0 }}>
          No matches in the last 7 days. Older articles aren&apos;t retained, so this can&apos;t
          reach further back.
        </p>
      )}

      {!loading && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map(article => (
            <div key={article.id}>{renderArticle(article, trimmed)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
