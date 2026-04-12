"use client";

import {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useCallback,
  useEffect,
} from "react";
import {
  type Source,
  type Article,
  type SummaryMode,
  DEFAULT_ACCENT,
} from "../data/mockArticles";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContentProfile = "short" | "standard" | "deepDive";

export interface ManagedSource extends Source {
  contentProfile: ContentProfile;
  articleCount: number;
}

export interface BookmarkedArticle {
  article: Article;
  source: Source;
  savedAt: Date;
  summaryMode: SummaryMode;
}

export interface AppState {
  sources: ManagedSource[];
  bookmarks: BookmarkedArticle[];
  articles: Article[];
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type AppAction =
  | { type: "ADD_SOURCE"; payload: Source }
  | { type: "REMOVE_SOURCE"; payload: string }
  | { type: "SET_SOURCE_PROFILE"; payload: { sourceId: string; profile: ContentProfile } }
  | { type: "SET_ARTICLES"; payload: Article[] }
  | { type: "SET_BOOKMARKS"; payload: BookmarkedArticle[] }
  | { type: "UPSERT_BOOKMARK"; payload: BookmarkedArticle }
  | { type: "REMOVE_BOOKMARK"; payload: string }
  | { type: "UPDATE_ARTICLE_SUMMARY"; payload: { articleId: string; mode: SummaryMode; text: string } }
  | { type: "PATCH_ARTICLE_SUMMARY"; payload: { articleId: string; mode: SummaryMode; text: string } };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_SOURCE": {
      const already = state.sources.find((s) => s.id === action.payload.id);
      if (already) return state;
      const newSource: ManagedSource = {
        ...action.payload,
        contentProfile: (action.payload as ManagedSource).contentProfile ?? "standard",
        articleCount: 0,
      };
      return {
        ...state,
        sources: [...state.sources, newSource],
        bookmarks: state.bookmarks.map((b) =>
          b.source.id === newSource.id ? { ...b, source: newSource } : b
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

    default:
      return state;
  }
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: AppState = {
  sources: [],
  bookmarks: [],
  articles: [],
};

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppStateContextValue {
  state: AppState;
  addSource: (source: Source) => void;
  removeSource: (sourceId: string) => void;
  setSourceProfile: (sourceId: string, profile: ContentProfile) => void;
  setArticles: (articles: Article[]) => void;
  patchArticleSummary: (articleId: string, mode: SummaryMode, text: string) => void;
  saveBookmark: (article: Article, source: Source, summaryMode: SummaryMode) => Promise<boolean>;
  removeBookmark: (articleLink: string) => Promise<boolean>;
  isBookmarked: (articleId: string) => boolean;
  updateArticleSummary: (articleId: string, mode: SummaryMode, text: string) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

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
  const [state, dispatch] = useReducer(appReducer, initialState);

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
        const res = await fetch("/api/user/saved/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "rohil",
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
    []
  );
  const removeBookmark = useCallback(
    async (articleLink: string) => {
      try {
        const res = await fetch("/api/user/saved/articles", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "rohil",
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
    []
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

  useEffect(() => {
    let cancelled = false;

    async function loadSavedArticles() {
      try {
        const res = await fetch("/api/user/saved/articles?username=rohil");
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
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        state,
        addSource,
        removeSource,
        setSourceProfile,
        setArticles,
        patchArticleSummary,
        saveBookmark,
        removeBookmark,
        isBookmarked,
        updateArticleSummary,
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
