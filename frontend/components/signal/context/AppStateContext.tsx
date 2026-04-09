"use client";

import {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useCallback,
} from "react";
import {
  type Source,
  type Article,
  type SummaryMode,
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
  | { type: "TOGGLE_BOOKMARK"; payload: { article: Article; source: Source; summaryMode: SummaryMode } }
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
      return { ...state, sources: [...state.sources, newSource] };
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

    case "TOGGLE_BOOKMARK": {
      const { article, source, summaryMode } = action.payload;
      const exists = state.bookmarks.find((b) => b.article.id === article.id);
      if (exists) {
        return {
          ...state,
          bookmarks: state.bookmarks.filter((b) => b.article.id !== article.id),
        };
      }
      return {
        ...state,
        bookmarks: [
          { article, source, savedAt: new Date(), summaryMode },
          ...state.bookmarks,
        ],
      };
    }

    case "SET_ARTICLES": {
      return { ...state, articles: action.payload };
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
  toggleBookmark: (article: Article, source: Source, summaryMode: SummaryMode) => void;
  isBookmarked: (articleId: string) => boolean;
  updateArticleSummary: (articleId: string, mode: SummaryMode, text: string) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

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
  const toggleBookmark = useCallback(
    (article: Article, source: Source, summaryMode: SummaryMode) =>
      dispatch({ type: "TOGGLE_BOOKMARK", payload: { article, source, summaryMode } }),
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

  return (
    <AppStateContext.Provider
      value={{
        state,
        addSource,
        removeSource,
        setSourceProfile,
        setArticles,
        patchArticleSummary,
        toggleBookmark,
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
