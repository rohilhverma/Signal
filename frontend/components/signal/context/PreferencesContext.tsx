"use client";

import { createContext, useContext, useReducer, ReactNode } from "react";

export type Theme = "light" | "dark" | "sepia";
export type FontFamily = "sans" | "serif" | "mono";
export type Density = "comfortable" | "compact";
export type ViewMode = "feed" | "reader";

export interface Preferences {
  theme: Theme;
  fontFamily: FontFamily;
  fontSize: number;
  density: Density;
  viewMode: ViewMode;
}

type PreferencesAction =
  | { type: "SET_THEME"; payload: Theme }
  | { type: "CYCLE_THEME" }
  | { type: "SET_FONT_FAMILY"; payload: FontFamily }
  | { type: "SET_FONT_SIZE"; payload: number }
  | { type: "SET_DENSITY"; payload: Density }
  | { type: "SET_VIEW_MODE"; payload: ViewMode };

interface PreferencesContextValue extends Preferences {
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
  setFontFamily: (font: FontFamily) => void;
  setFontSize: (size: number) => void;
  setDensity: (density: Density) => void;
  setViewMode: (mode: ViewMode) => void;
}

const defaultPreferences: Preferences = {
  theme: "light",
  fontFamily: "sans",
  fontSize: 16,
  density: "comfortable",
  viewMode: "feed",
};

const THEME_ORDER: Theme[] = ["light", "dark", "sepia"];

function preferencesReducer(state: Preferences, action: PreferencesAction): Preferences {
  switch (action.type) {
    case "SET_THEME":
      return { ...state, theme: action.payload };
    case "CYCLE_THEME": {
      const idx = THEME_ORDER.indexOf(state.theme);
      return { ...state, theme: THEME_ORDER[(idx + 1) % THEME_ORDER.length] };
    }
    case "SET_FONT_FAMILY":
      return { ...state, fontFamily: action.payload };
    case "SET_FONT_SIZE":
      return { ...state, fontSize: action.payload };
    case "SET_DENSITY":
      return { ...state, density: action.payload };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };
    default:
      return state;
  }
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(preferencesReducer, defaultPreferences);

  const value: PreferencesContextValue = {
    ...state,
    setTheme: (theme) => dispatch({ type: "SET_THEME", payload: theme }),
    cycleTheme: () => dispatch({ type: "CYCLE_THEME" }),
    setFontFamily: (font) => dispatch({ type: "SET_FONT_FAMILY", payload: font }),
    setFontSize: (size) => dispatch({ type: "SET_FONT_SIZE", payload: size }),
    setDensity: (density) => dispatch({ type: "SET_DENSITY", payload: density }),
    setViewMode: (mode) => dispatch({ type: "SET_VIEW_MODE", payload: mode }),
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return ctx;
}
