"use client";

import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  Rss,
  LayoutDashboard,
  Bookmark,
  Globe,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppState } from "../context/AppStateContext";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  badgeKey?: "bookmarks";
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  // Compute year client-side only to avoid SSR/client hydration mismatch
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <aside
      className={cn(
        // Base: fixed overlay for mobile
        "fixed inset-y-0 left-0 z-50 flex flex-col",
        // Desktop: back to sticky in flex flow
        "md:sticky md:top-0 md:h-screen md:z-30",
        // Slide in/out transition
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        "shrink-0 overflow-hidden"
      )}
      style={{
        width: 240,
        backgroundColor: "var(--sg-sidebar)",
        borderRight: "1px solid var(--sg-border)",
      }}
    >
      {/* Branding */}
      <div
        className="flex items-center justify-between px-5 pt-6 pb-2"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{
              backgroundColor: "var(--sg-logo-bg, #2c2c2a)",
              color: "var(--sg-logo-color, #fff)",
            }}
          >
            <Rss className="w-3.5 h-3.5" style={{ color: "inherit" }} />
          </div>
          <div>
            <div
              className="text-sm font-bold tracking-tight leading-none"
              style={{ color: "var(--sg-text)", fontFamily: "var(--font-inter, Inter, sans-serif)" }}
            >
              Signal
            </div>
            <div
              className="text-[10px] mt-0.5 leading-none"
              style={{ color: "var(--sg-muted)" }}
            >
              Your news, distilled.
            </div>
          </div>
        </div>

        {/* Close button — mobile only */}
        <button
          className="md:hidden flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          style={{ color: "var(--sg-muted)" }}
          onClick={onClose}
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="mx-4 mt-4 mb-2" style={{ height: 1, backgroundColor: "var(--sg-border)" }} />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto">
        <ul className="flex flex-col gap-0.5" role="list">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    fontSize: "13.5px",
                    fontWeight: isActive ? 500 : 400,
                    fontFamily: "var(--font-inter, Inter, sans-serif)",
                    color: "var(--sg-text)",
                    backgroundColor: isActive ? "var(--sg-nav-active)" : "transparent",
                    borderLeft: isActive
                      ? "2px solid var(--sg-text)"
                      : "2px solid transparent",
                    textDecoration: "none",
                    transition: "background-color 0.15s ease, color 0.15s ease",
                    outline: "none",
                  })}
                  className="hover:opacity-90"
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className="w-4 h-4 shrink-0"
                        style={{
                          color: isActive ? "var(--sg-text)" : "var(--sg-muted)",
                        }}
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4">
        <div
          className="text-[11px]"
          style={{ color: "var(--sg-muted)", fontFamily: "var(--font-inter, Inter, sans-serif)" }}
        >
          Signal &copy; {year ?? ""}
        </div>
      </div>
    </aside>
  );
}
