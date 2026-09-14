"use client";

import {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  type Source,
  type Article,
  type SummaryMode,
  DEFAULT_ACCENT,
} from "../data/mockArticles";
import { useAuth } from "./AuthContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContentProfile = "short" | "standard" | "deepDive";

export interface ManagedSource extends Source {
  contentProfile: ContentProfile;
  articleCount: number;
  /** ISO instant while hidden, null while live. Never a lapsed date - the server clears it. */
  mutedUntil: string | null;
  /** A mute with no end date, which also stops the nightly scrape for this source. */
  mutedIndefinitely: boolean;
}

/** One row of GET /user/sources. Mirrors SubscriptionDTO on the backend. */
export interface ServerSource {
  websiteURL: string;
  contentMode: string;
  mutedUntil: string | null;
  indefinite: boolean;
  articleCount: number;
}

export interface BookmarkedArticle {
  article: Article;
  source: Source;
  savedAt: Date;
  summaryMode: SummaryMode;
}

export type ArticleInteractionType =
  | "article_click"
  | "deep_dive_click"
  | "bookmark_click"
  | "link_click";

export interface ArticleInteractionSummary {
  articleId: string;
  articleTitle: string;
  articleUrl: string;
  sourceId: string;
  articleClicks: number;
  deepDiveClicks: number;
  bookmarkClicks: number;
  linkClicks: number;
  interactionScore: number;
  lastEventAt: number;
}

export interface ArticleInteractionEvent {
  id: string;
  articleId: string;
  articleTitle: string;
  articleUrl: string;
  sourceId: string;
  type: ArticleInteractionType;
  scoreDelta: number;
  occurredAt: number;
}

export interface AppState {
  sources: ManagedSource[];
  bookmarks: BookmarkedArticle[];
  articles: Article[];
  articleInteractions: Record<string, ArticleInteractionSummary>;
  recentArticleInteractions: ArticleInteractionEvent[];
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type AppAction =
  | { type: "ADD_SOURCE"; payload: Source }
  | { type: "HYDRATE_SOURCES"; payload: ServerSource[] }
  | { type: "SET_SOURCE_ACCENT"; payload: { sourceId: string; faviconUrl: string; accentColor: string } }
  | { type: "REMOVE_SOURCE"; payload: string }
  | { type: "SET_SOURCE_PROFILE"; payload: { sourceId: string; profile: ContentProfile } }
  | { type: "SET_ARTICLES"; payload: Article[] }
  | { type: "SET_BOOKMARKS"; payload: BookmarkedArticle[] }
  | { type: "UPSERT_BOOKMARK"; payload: BookmarkedArticle }
  | { type: "REMOVE_BOOKMARK"; payload: string }
  | { type: "UPDATE_ARTICLE_SUMMARY"; payload: { articleId: string; mode: SummaryMode; text: string } }
  | { type: "PATCH_ARTICLE_SUMMARY"; payload: { articleId: string; mode: SummaryMode; text: string } }
  | { type: "TRACK_ARTICLE_INTERACTION"; payload: { article: Article; type: ArticleInteractionType } };

const INTERACTION_SCORE_BY_TYPE: Record<ArticleInteractionType, number> = {
  article_click: 1,
  deep_dive_click: 4,
  bookmark_click: 4,
  link_click: 3,
};

const ARTICLE_INTERACTION_BEACON_ENDPOINT = "/api/user/activity";

function buildArticleInteractionScoreMap(
  interactions: Record<string, ArticleInteractionSummary>
): Record<string, number> {
  return Object.values(interactions).reduce<Record<string, number>>((acc, summary) => {
    if (summary.articleUrl && summary.interactionScore > 0) {
      acc[summary.articleUrl] = summary.interactionScore;
    }
    return acc;
  }, {});
}

// pagehide and visibilitychange-to-hidden both fire for the same navigation, so a naive
// flush-on-either posts the same cumulative snapshot twice. Comparing against what was
// last sent turns the second call into a no-op instead.
function activityMapsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_SOURCE": {
      const already = state.sources.find((s) => s.id === action.payload.id);
      if (already) {
        // The dashboard resolves presentation the context cannot: the site's real name from
        // the feed payload, and an accent sampled off its favicon. HYDRATE_SOURCES runs
        // first and seeds placeholders, so bailing out here froze every source on the grey
        // default. Only presentation merges - contentProfile, articleCount and mute state
        // stay authoritative from the server.
        const incoming = action.payload as ManagedSource;
        const presentation = {
          name: incoming.name || already.name,
          domain: incoming.domain || already.domain,
          faviconUrl: incoming.faviconUrl || already.faviconUrl,
          accentColor: incoming.accentColor || already.accentColor,
          paywall: incoming.paywall ?? already.paywall,
        };
        // The dashboard re-adds every source on each feed poll. Returning a new object when
        // nothing changed would churn the array identity and re-render the whole feed on a
        // timer, which is what the old early return was quietly buying.
        const changed = (Object.keys(presentation) as (keyof typeof presentation)[])
          .some((key) => presentation[key] !== already[key]);
        if (!changed) return state;

        const merged: ManagedSource = { ...already, ...presentation };
        return {
          ...state,
          sources: state.sources.map((item) => (item.id === merged.id ? merged : item)),
          bookmarks: state.bookmarks.map((b) =>
            b.source.id === merged.id ? { ...b, source: merged } : b
          ),
        };
      }
      const newSource: ManagedSource = {
        ...action.payload,
        contentProfile: (action.payload as ManagedSource).contentProfile ?? "standard",
        articleCount: 0,
        mutedUntil: null,
        mutedIndefinitely: false,
      };
      return {
        ...state,
        sources: [...state.sources, newSource],
        bookmarks: state.bookmarks.map((b) =>
          b.source.id === newSource.id ? { ...b, source: newSource } : b
        ),
      };
    }

    case "HYDRATE_SOURCES": {
      // The server owns which sources exist and whether they are muted; the client owns
      // what it worked out about each one (resolved favicon, accent, article count).
      // Merging rather than replacing is what keeps a hydrate from flashing every card
      // back to the placeholder favicon.
      //
      // Sources the server no longer lists are dropped, but their articles and bookmarks
      // are left alone - a muted source still has bookmarks worth keeping, and REMOVE_SOURCE
      // remains the only path that deliberately discards them.
      const byId = new Map(state.sources.map((source) => [source.id, source]));
      return {
        ...state,
        sources: action.payload.map((row) => ({
          ...(byId.get(row.websiteURL) ?? createFallbackManagedSource(row.websiteURL)),
          contentProfile: (row.contentMode || "standard") as ContentProfile,
          mutedUntil: row.mutedUntil,
          mutedIndefinitely: row.indefinite,
          articleCount: row.articleCount,
        })),
      };
    }

    case "SET_SOURCE_ACCENT": {
      // Sets only the two fields sampled from the favicon, never the name: the feed payload
      // carries the site's own name ("Ars Technica", not "Arstechnica") and this must not
      // overwrite it with anything cruder.
      const { sourceId, faviconUrl, accentColor } = action.payload;
      const target = state.sources.find((item) => item.id === sourceId);
      if (!target || (target.faviconUrl === faviconUrl && target.accentColor === accentColor)) {
        return state;
      }
      const updated: ManagedSource = { ...target, faviconUrl, accentColor };
      return {
        ...state,
        sources: state.sources.map((item) => (item.id === sourceId ? updated : item)),
        bookmarks: state.bookmarks.map((b) =>
          b.source.id === sourceId ? { ...b, source: updated } : b
        ),
      };
    }

    case "REMOVE_SOURCE": {
      return {
        ...state,
        sources: state.sources.filter((s) => s.id !== action.payload),
        articles: state.articles.filter((a) => a.sourceId !== action.payload),
        bookmarks: state.bookmarks.filter((b) => b.source.id !== action.payload),
      };
    }

    case "SET_SOURCE_PROFILE": {
      return {
        ...state,
        sources: state.sources.map((s) =>
          s.id === action.payload.sourceId
            ? { ...s, contentProfile: action.payload.profile }
            : s
        ),
      };
    }

    case "UPSERT_BOOKMARK": {
      const incoming = action.payload;
      const exists = state.bookmarks.find((b) => b.article.id === incoming.article.id);
      if (exists) {
        return {
          ...state,
          bookmarks: state.bookmarks.map((bookmark) =>
            bookmark.article.id === incoming.article.id ? incoming : bookmark
          ),
        };
      }
      return {
        ...state,
        bookmarks: [
          incoming,
          ...state.bookmarks,
        ],
      };
    }

    case "REMOVE_BOOKMARK": {
      return {
        ...state,
        bookmarks: state.bookmarks.filter((bookmark) => bookmark.article.id !== action.payload),
      };
    }

    case "SET_ARTICLES": {
      const articlesById = new Map(action.payload.map((article) => [article.id, article]));
      return {
        ...state,
        articles: action.payload,
        bookmarks: state.bookmarks.map((bookmark) => {
          const hydratedArticle = articlesById.get(bookmark.article.id);
          if (!hydratedArticle) return bookmark;
          const hydratedSource = state.sources.find((source) => source.id === hydratedArticle.sourceId) ?? bookmark.source;
          return {
            ...bookmark,
            article: hydratedArticle,
            source: hydratedSource,
          };
        }),
      };
    }

    case "SET_BOOKMARKS": {
      const existingById = new Map(state.bookmarks.map((bookmark) => [bookmark.article.id, bookmark]));
      const merged = action.payload.map((bookmark) => {
        const existing = existingById.get(bookmark.article.id);
        return existing
          ? {
              ...bookmark,
              article: existing.article,
              source: existing.source,
              savedAt: existing.savedAt,
              summaryMode: existing.summaryMode,
            }
          : bookmark;
      });
      const incomingIds = new Set(action.payload.map((bookmark) => bookmark.article.id));
      const localOnly = state.bookmarks.filter((bookmark) => !incomingIds.has(bookmark.article.id));
      return { ...state, bookmarks: [...merged, ...localOnly] };
    }

    case "PATCH_ARTICLE_SUMMARY": {
      const { articleId, mode, text } = action.payload;
      const patch = (a: Article): Article => {
        if (a.id !== articleId) return a;
        if (mode === "short") return { ...a, summaryShort: text };
        if (mode === "deepDive") return { ...a, summaryDeepDive: text };
        return a;
      };
      return {
        ...state,
        articles: state.articles.map(patch),
        bookmarks: state.bookmarks.map((b) => ({ ...b, article: patch(b.article) })),
      };
    }

    case "UPDATE_ARTICLE_SUMMARY": {
      const { articleId, mode, text } = action.payload;
      const update = (a: Article): Article => {
        if (a.id !== articleId) return a;
        if (mode === "short") return { ...a, summaryShort: text };
        if (mode === "deepDive") return { ...a, summaryDeepDive: text };
        return a;
      };
      return {
        ...state,
        articles: state.articles.map(update),
        bookmarks: state.bookmarks.map((b) => ({
          ...b,
          article: update(b.article),
        })),
      };
    }

    case "TRACK_ARTICLE_INTERACTION": {
      const { article, type } = action.payload;
      const previous = state.articleInteractions[article.id] ?? {
        articleId: article.id,
        articleTitle: article.title,
        articleUrl: article.url,
        sourceId: article.sourceId,
        articleClicks: 0,
        deepDiveClicks: 0,
        bookmarkClicks: 0,
        linkClicks: 0,
        interactionScore: 0,
        lastEventAt: 0,
      };
      const scoreDelta = INTERACTION_SCORE_BY_TYPE[type];

      const nextSummary: ArticleInteractionSummary = {
        ...previous,
        articleTitle: article.title,
        articleUrl: article.url,
        sourceId: article.sourceId,
        articleClicks: previous.articleClicks + (type === "article_click" ? 1 : 0),
        deepDiveClicks: previous.deepDiveClicks + (type === "deep_dive_click" ? 1 : 0),
        bookmarkClicks: previous.bookmarkClicks + (type === "bookmark_click" ? 1 : 0),
        linkClicks: previous.linkClicks + (type === "link_click" ? 1 : 0),
        interactionScore: previous.interactionScore + scoreDelta,
        lastEventAt: Date.now(),
      };

      const nextEvent: ArticleInteractionEvent = {
        id: `${article.id}-${type}-${Date.now()}-${state.recentArticleInteractions.length}`,
        articleId: article.id,
        articleTitle: article.title,
        articleUrl: article.url,
        sourceId: article.sourceId,
        type,
        scoreDelta,
        occurredAt: Date.now(),
      };

      return {
        ...state,
        articleInteractions: {
          ...state.articleInteractions,
          [article.id]: nextSummary,
        },
        recentArticleInteractions: [
          nextEvent,
          ...state.recentArticleInteractions,
        ].slice(0, 200),
      };
    }

    default:
      return state;
  }
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: AppState = {
  sources: [],
  bookmarks: [],
  articles: [],
  articleInteractions: {},
  recentArticleInteractions: [],
};

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppStateContextValue {
  state: AppState;
  addSource: (source: Source) => void;
  removeSource: (sourceId: string) => void;
  setSourceProfile: (sourceId: string, profile: ContentProfile) => void;
  refreshSources: () => Promise<void>;
  muteSource: (sourceId: string, days: number | null) => Promise<boolean>;
  unmuteSource: (sourceId: string) => Promise<boolean>;
  setArticles: (articles: Article[]) => void;
  patchArticleSummary: (articleId: string, mode: SummaryMode, text: string) => void;
  saveBookmark: (article: Article, source: Source, summaryMode: SummaryMode) => Promise<boolean>;
  removeBookmark: (articleLink: string) => Promise<boolean>;
  isBookmarked: (articleId: string) => boolean;
  updateArticleSummary: (articleId: string, mode: SummaryMode, text: string) => void;
  trackArticleInteraction: (article: Article, type: ArticleInteractionType) => void;
  getArticleInteraction: (articleId: string) => ArticleInteractionSummary | null;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

/**
 * A displayable source from nothing but its id. Muted sources are absent from
 * /user/website by design, so the sources screen has no feed payload to derive a name or
 * favicon from and has to synthesise both from the domain.
 */
export function createFallbackManagedSource(sourceId: string): ManagedSource {
  try {
    // sourceId is a bare domain everywhere in this app (it's what the backend stores
    // and matches on) - URL() needs a scheme to parse a hostname out of it at all.
    const url = new URL(/^https?:\/\//i.test(sourceId) ? sourceId : `https://${sourceId}`);
    const hostname = url.hostname.replace(/^www\./, "");
    return {
      id: sourceId,
      name: hostname.split(".")[0].replace(/^\w/, (char) => char.toUpperCase()),
      domain: hostname,
      // Through our own route rather than Google directly - /api/favicon/image exists so the
      // browser never tells Google which sites you read. This builder now supplies the
      // favicon for every hydrated source, so going direct would leak the whole list at once.
      faviconUrl: `/api/favicon/image?domain=${hostname}`,
      accentColor: DEFAULT_ACCENT,
      contentProfile: "standard",
      articleCount: 0,
      mutedUntil: null,
      mutedIndefinitely: false,
    };
  } catch {
    return {
      id: sourceId,
      name: sourceId,
      domain: sourceId,
      faviconUrl: "",
      accentColor: DEFAULT_ACCENT,
      contentProfile: "standard",
      articleCount: 0,
      mutedUntil: null,
      mutedIndefinitely: false,
    };
  }
}

function createFallbackSource(articleLink: string): Source {
  try {
    const url = new URL(articleLink);
    const hostname = url.hostname.replace(/^www\./, "");
    return {
      id: url.origin,
      name: hostname.split(".")[0].replace(/^\w/, (char) => char.toUpperCase()),
      domain: hostname,
      faviconUrl: `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`,
      accentColor: DEFAULT_ACCENT,
    };
  } catch {
    return {
      id: articleLink,
      name: "Saved Article",
      domain: articleLink,
      faviconUrl: "",
      accentColor: DEFAULT_ACCENT,
    };
  }
}

function createFallbackBookmark(articleTitle: string, articleLink: string): BookmarkedArticle {
  const source = createFallbackSource(articleLink);
  const summaryDefault = "Saved article. Open the original link to read it.";

  return {
    article: {
      id: articleLink,
      sourceId: source.id,
      title: articleTitle,
      url: articleLink,
      summaryShort: null,
      summaryDefault,
      summaryDeepDive: null,
      publishedAt: new Date(),
      processedAt: new Date(),
      originalWordCount: 0,
      summaryWordCount: summaryDefault.split(/\s+/).filter(Boolean).length,
    },
    source,
    savedAt: new Date(),
    summaryMode: "default",
  };
}

function createBookmark(article: Article, source: Source, summaryMode: SummaryMode): BookmarkedArticle {
  return {
    article,
    source,
    savedAt: new Date(),
    summaryMode,
  };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { authenticatedFetch } = useAuth();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const latestInteractionsRef = useRef(state.articleInteractions);
  const lastFlushedActivityRef = useRef<Record<string, number>>({});

  useEffect(() => {
    latestInteractionsRef.current = state.articleInteractions;
  }, [state.articleInteractions]);

  const addSource = useCallback(
    (source: Source) => dispatch({ type: "ADD_SOURCE", payload: source }),
    []
  );
  const removeSource = useCallback(
    (sourceId: string) => dispatch({ type: "REMOVE_SOURCE", payload: sourceId }),
    []
  );
  const setSourceProfile = useCallback(
    (sourceId: string, profile: ContentProfile) =>
      dispatch({ type: "SET_SOURCE_PROFILE", payload: { sourceId, profile } }),
    []
  );
  const saveBookmark = useCallback(
    async (article: Article, source: Source, summaryMode: SummaryMode) => {
      try {
        const res = await authenticatedFetch("/api/user/saved/articles", {
          method: "POST",
          body: JSON.stringify({
            articleLink: article.url,
            articleTitle: article.title,
          }),
        });

        if (!res.ok) {
          return false;
        }

        dispatch({ type: "UPSERT_BOOKMARK", payload: createBookmark(article, source, summaryMode) });
        return true;
      } catch (error) {
        console.error("Failed to save article:", error);
        return false;
      }
    },
    [authenticatedFetch]
  );
  const removeBookmark = useCallback(
    async (articleLink: string) => {
      try {
        const res = await authenticatedFetch("/api/user/saved/articles", {
          method: "DELETE",
          body: JSON.stringify({
            articleLink,
          }),
        });

        if (!res.ok) {
          return false;
        }

        dispatch({ type: "REMOVE_BOOKMARK", payload: articleLink });
        return true;
      } catch (error) {
        console.error("Failed to remove saved article:", error);
        return false;
      }
    },
    [authenticatedFetch]
  );
  const isBookmarked = useCallback(
    (articleId: string) => state.bookmarks.some((b) => b.article.id === articleId),
    [state.bookmarks]
  );
  const setArticles = useCallback(
    (articles: Article[]) => dispatch({ type: "SET_ARTICLES", payload: articles }),
    []
  );
  const patchArticleSummary = useCallback(
    (articleId: string, mode: SummaryMode, text: string) =>
      dispatch({ type: "PATCH_ARTICLE_SUMMARY", payload: { articleId, mode, text } }),
    []
  );
  const updateArticleSummary = useCallback(
    (articleId: string, mode: SummaryMode, text: string) =>
      dispatch({ type: "UPDATE_ARTICLE_SUMMARY", payload: { articleId, mode, text } }),
    []
  );
  const trackArticleInteraction = useCallback(
    (article: Article, type: ArticleInteractionType) => {
      const current = latestInteractionsRef.current[article.id];
      const scoreDelta = INTERACTION_SCORE_BY_TYPE[type];
      const nextScore = (current?.interactionScore ?? 0) + scoreDelta;

      console.log("[signal] article interaction", {
        articleId: article.id,
        articleTitle: article.title,
        articleUrl: article.url,
        type,
        scoreDelta,
        nextScore,
      });

      dispatch({ type: "TRACK_ARTICLE_INTERACTION", payload: { article, type } });
    },
    []
  );
  const getArticleInteraction = useCallback(
    (articleId: string) => state.articleInteractions[articleId] ?? null,
    [state.articleInteractions]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSavedArticles() {
      try {
        const res = await authenticatedFetch("/api/user/saved/articles");
        if (!res.ok) return;

        const savedArticles = await res.json() as Record<string, string>;
        if (cancelled) return;

        const bookmarks = Object.entries(savedArticles).map(([articleTitle, articleLink]) =>
          createFallbackBookmark(articleTitle, articleLink)
        );

        dispatch({ type: "SET_BOOKMARKS", payload: bookmarks });
      } catch (error) {
        console.error("Failed to load saved articles:", error);
      }
    }

    loadSavedArticles();

    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch]);

  useEffect(() => {
    function flushArticleInteractionScores() {
      const activity = buildArticleInteractionScoreMap(latestInteractionsRef.current);
      if (Object.keys(activity).length === 0) {
        return;
      }

      // pagehide and visibilitychange-to-hidden fire back to back for one navigation,
      // before a keepalive request has any chance to resolve — there is no "wait for
      // success" moment during unload to hang this guard on. Recording the attempt
      // synchronously, before the fetch settles, is what makes the second event a
      // no-op instead of a duplicate POST of the same cumulative snapshot.
      if (activityMapsEqual(activity, lastFlushedActivityRef.current)) {
        return;
      }
      lastFlushedActivityRef.current = activity;

      const payload = { activity };

      console.log("[signal] article interaction beacon payload", payload);

      if (!ARTICLE_INTERACTION_BEACON_ENDPOINT) {
        return;
      }

      void authenticatedFetch(ARTICLE_INTERACTION_BEACON_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch((error) => {
        console.error("Failed to flush article activity:", error);
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushArticleInteractionScores();
      }
    }

    window.addEventListener("pagehide", flushArticleInteractionScores);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushArticleInteractionScores);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authenticatedFetch]);

  /**
   * Pulls the authoritative source list. Kept separate from the dashboard fetch because
   * /user/website deliberately omits muted sources - reading the list from there would
   * make a source disappear from the one screen that can bring it back.
   */
  // Sources whose accent has already been sampled. refreshSources runs after every mute
  // toggle, and without this each toggle would re-fetch a favicon for all ten sites.
  const enrichedRef = useRef<Set<string>>(new Set());

  /**
   * Samples each source's accent colour from its favicon. This lives here rather than in
   * the dashboard because the sources screen needs the colours too, and gating them on a
   * completed dashboard fetch means landing anywhere else shows ten identical grey rows.
   */
  const enrichSourceAccents = useCallback((rows: ServerSource[]) => {
    rows.forEach(async (row) => {
      if (enrichedRef.current.has(row.websiteURL)) return;
      enrichedRef.current.add(row.websiteURL);
      const hostname = row.websiteURL.replace(/^https?:\/\//i, "").replace(/^www\./, "");
      try {
        const fav = await fetch(`/api/favicon?domain=${hostname}`)
          .then((r) => r.json()) as { faviconUrl: string; color: string };
        dispatch({
          type: "SET_SOURCE_ACCENT",
          payload: { sourceId: row.websiteURL, faviconUrl: fav.faviconUrl, accentColor: fav.color },
        });
      } catch {
        // Drop the claim so a later hydrate can retry rather than leaving it grey forever.
        enrichedRef.current.delete(row.websiteURL);
      }
    });
  }, []);

  const refreshSources = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/user/sources");
      if (!res.ok) return;
      const rows = (await res.json()) as ServerSource[];
      dispatch({ type: "HYDRATE_SOURCES", payload: rows });
      enrichSourceAccents(rows);
    } catch {
      // Keeping the last known list beats blanking the sources screen on a transient failure.
    }
  }, [authenticatedFetch, enrichSourceAccents]);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  /** days === null mutes with no end date, which also stops the nightly scrape. */
  const muteSource = useCallback(
    async (sourceId: string, days: number | null): Promise<boolean> => {
      try {
        const res = await authenticatedFetch("/api/user/website/mute", {
          method: "POST",
          body: JSON.stringify(days === null ? { websiteURL: sourceId } : { websiteURL: sourceId, days }),
        });
        if (!res.ok) return false;
        await refreshSources();
        return true;
      } catch {
        return false;
      }
    },
    [authenticatedFetch, refreshSources]
  );

  const unmuteSource = useCallback(
    async (sourceId: string): Promise<boolean> => {
      try {
        const res = await authenticatedFetch("/api/user/website/mute", {
          method: "DELETE",
          body: JSON.stringify({ websiteURL: sourceId }),
        });
        if (!res.ok) return false;
        await refreshSources();
        return true;
      } catch {
        return false;
      }
    },
    [authenticatedFetch, refreshSources]
  );

  return (
    <AppStateContext.Provider
      value={{
        state,
        addSource,
        removeSource,
        setSourceProfile,
        refreshSources,
        muteSource,
        unmuteSource,
        setArticles,
        patchArticleSummary,
        saveBookmark,
        removeBookmark,
        isBookmarked,
        updateArticleSummary,
        trackArticleInteraction,
        getArticleInteraction,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
