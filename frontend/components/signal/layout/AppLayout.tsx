"use client";

import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { usePreferences } from "../context/PreferencesContext";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { FloatingActionButton } from "./FloatingActionButton";
import { DashboardPage } from "../pages/DashboardPage";
import { SavedPage } from "../pages/SavedPage";
import { SourcesPage } from "../pages/SourcesPage";
import { SettingsPage } from "../pages/SettingsPage";

const FONT_FAMILY_MAP: Record<string, string> = {
  sans: "var(--font-inter, 'Inter', sans-serif)",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)",
};

export function AppLayout() {
  const { theme, fontFamily, fontSize } = usePreferences();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync theme to <html> so Radix portals (rendered in document.body) can access --sg-* CSS vars
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div
      className="signal-app"
      data-theme={theme}
      style={{
        minHeight: "100vh",
        display: "flex",
        backgroundColor: "var(--sg-bg)",
        color: "var(--sg-text)",
      }}
    >
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            zIndex: 40,
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflowX: "hidden",
        }}
      >
        <Toolbar onMenuClick={() => setSidebarOpen(true)} />

        <main
          style={{
            flex: 1,
            overflowY: "auto",
            fontFamily: FONT_FAMILY_MAP[fontFamily],
            fontSize: `${fontSize}px`,
            backgroundColor: "var(--sg-bg)",
            transition: "background-color 0.2s ease",
          }}
        >
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>

      {/* Floating Action Button */}
      <FloatingActionButton />
    </div>
  );
}
