"use client";

import { useLocation } from "react-router-dom";
import { Sun, Moon, Coffee, Menu } from "lucide-react";
import { usePreferences, Theme } from "../context/PreferencesContext";
import { PreferencesPopover } from "./PreferencesPopover";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/saved": "Saved",
  "/sources": "Manage Sources",
  "/settings": "Settings",
};

const THEME_ICONS: Record<Theme, React.ElementType> = {
  light: Sun,
  dark: Moon,
  sepia: Coffee,
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Switch to dark mode",
  dark: "Switch to sepia mode",
  sepia: "Switch to light mode",
};

interface ToolbarProps {
  onMenuClick: () => void;
}

export function Toolbar({ onMenuClick }: ToolbarProps) {
  const { pathname } = useLocation();
  const { theme, cycleTheme } = usePreferences();

  const pageTitle = ROUTE_TITLES[pathname] ?? "Signal";
  const ThemeIcon = THEME_ICONS[theme];

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-5 shrink-0"
      style={{
        height: 52,
        backgroundColor: "var(--sg-toolbar)",
        borderBottom: "1px solid var(--sg-border)",
      }}
    >
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3">
        <button
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-md transition-colors"
          style={{ color: "var(--sg-muted)" }}
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu className="w-4.5 h-4.5" />
        </button>
        <h1
          className="text-sm font-semibold tracking-tight"
          style={{
            color: "var(--sg-text)",
            fontFamily: "var(--font-inter, Inter, sans-serif)",
          }}
        >
          {pageTitle}
        </h1>
      </div>

      {/* Right: theme toggle + preferences */}
      <div className="flex items-center gap-2">
        {/* Theme cycle button */}
        <button
          onClick={cycleTheme}
          aria-label={THEME_LABELS[theme]}
          title={THEME_LABELS[theme]}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
          style={{
            color: "var(--sg-muted)",
            backgroundColor: "transparent",
            border: "1px solid var(--sg-border)",
          }}
        >
          <ThemeIcon className="w-3.5 h-3.5" />
        </button>

        {/* Preferences popover */}
        <PreferencesPopover />
      </div>
    </header>
  );
}
