"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Coffee, Type, AlignJustify, Clock, Tags, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAppState } from "../context/AppStateContext";
import { usePreferences, type Theme, type FontFamily, type Density } from "../context/PreferencesContext";
import { useToast } from "../context/ToastContext";

// ─── Section components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--sg-muted)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "var(--sg-surface)",
        border: "1px solid var(--sg-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
  noBorder,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "14px 18px",
        borderBottom: noBorder ? "none" : "1px solid var(--sg-border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sg-text)", lineHeight: 1.3 }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: "var(--sg-muted)", marginTop: 2, lineHeight: 1.5 }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ─── Theme picker ─────────────────────────────────────────────────────────────

const THEME_OPTIONS: {
  key: Theme;
  label: string;
  icon: React.ElementType;
  bg: string;
  surface: string;
  text: string;
  border: string;
}[] = [
  {
    key: "light",
    label: "Light",
    icon: Sun,
    bg: "#faf8f5",
    surface: "#fffdf9",
    text: "#1a1a2e",
    border: "#e8e3da",
  },
  {
    key: "dark",
    label: "Dark",
    icon: Moon,
    bg: "#111110",
    surface: "#1c1c1a",
    text: "#edebe8",
    border: "#2a2a26",
  },
  {
    key: "sepia",
    label: "Sepia",
    icon: Coffee,
    bg: "#f5f0e8",
    surface: "#faf6ee",
    text: "#3e2f1c",
    border: "#ddd5c4",
  },
];

function ThemePicker({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {THEME_OPTIONS.map((opt) => {
        const isActive = opt.key === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            aria-pressed={isActive}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 9,
              border: isActive ? "2px solid var(--sg-text)" : "2px solid var(--sg-border)",
              backgroundColor: isActive ? "var(--sg-nav-active)" : "transparent",
              cursor: "pointer",
              transition: "border-color 0.15s ease, background-color 0.15s ease",
              minWidth: 80,
            }}
          >
            {/* Mini preview swatch */}
            <div
              style={{
                width: 52,
                height: 34,
                borderRadius: 6,
                backgroundColor: opt.bg,
                border: `1px solid ${opt.border}`,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {/* Surface strip */}
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 6,
                  right: 6,
                  height: 6,
                  borderRadius: 2,
                  backgroundColor: opt.surface,
                  border: `1px solid ${opt.border}`,
                }}
              />
              {/* Text lines */}
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 16,
                  right: 14,
                  height: 3,
                  borderRadius: 1,
                  backgroundColor: opt.text,
                  opacity: 0.5,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 22,
                  right: 20,
                  height: 3,
                  borderRadius: 1,
                  backgroundColor: opt.text,
                  opacity: 0.3,
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Icon style={{ width: 11, height: 11, color: isActive ? "var(--sg-text)" : "var(--sg-muted)" }} />
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--sg-text)" : "var(--sg-muted)",
                }}
              >
                {opt.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Font picker ──────────────────────────────────────────────────────────────

const FONT_OPTIONS: { key: FontFamily; label: string; family: string; preview: string }[] = [
  {
    key: "sans",
    label: "Sans",
    family: "var(--font-inter, Inter, sans-serif)",
    preview: "The quick brown fox",
  },
  {
    key: "serif",
    label: "Serif",
    family: "Georgia, 'Times New Roman', serif",
    preview: "The quick brown fox",
  },
  {
    key: "mono",
    label: "Mono",
    family: "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)",
    preview: "The quick brown fox",
  },
];

function FontPicker({ value, onChange }: { value: FontFamily; onChange: (f: FontFamily) => void }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {FONT_OPTIONS.map((opt) => {
        const isActive = opt.key === value;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            aria-pressed={isActive}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              padding: "10px 14px",
              borderRadius: 9,
              border: isActive ? "2px solid var(--sg-text)" : "2px solid var(--sg-border)",
              backgroundColor: isActive ? "var(--sg-nav-active)" : "transparent",
              cursor: "pointer",
              transition: "border-color 0.15s ease, background-color 0.15s ease",
              minWidth: 100,
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontFamily: opt.family,
                color: "var(--sg-text)",
                lineHeight: 1.4,
              }}
            >
              {opt.preview}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--sg-text)" : "var(--sg-muted)",
                fontFamily: "var(--font-inter, Inter, sans-serif)",
              }}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Density toggle ───────────────────────────────────────────────────────────

const DENSITY_OPTIONS: { key: Density; label: string; description: string }[] = [
  { key: "comfortable", label: "Comfortable", description: "More breathing room" },
  { key: "compact", label: "Compact", description: "More articles visible" },
];

function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {DENSITY_OPTIONS.map((opt) => {
        const isActive = opt.key === value;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            aria-pressed={isActive}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 3,
              padding: "9px 14px",
              borderRadius: 9,
              border: isActive ? "2px solid var(--sg-text)" : "2px solid var(--sg-border)",
              backgroundColor: isActive ? "var(--sg-nav-active)" : "transparent",
              cursor: "pointer",
              transition: "border-color 0.15s ease, background-color 0.15s ease",
              minWidth: 120,
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "var(--sg-text)" : "var(--sg-muted)",
              }}
            >
              {opt.label}
            </span>
            <span style={{ fontSize: 11, color: "var(--sg-muted)" }}>{opt.description}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Time slot options ────────────────────────────────────────────────────────

const TIME_OPTIONS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "5:00 PM", "6:00 PM",
  "8:00 PM", "10:00 PM",
];

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function mergeKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeKeyword(value);
    if (!normalized) continue;

    const lowered = normalized.toLowerCase();
    if (seen.has(lowered)) continue;

    seen.add(lowered);
    next.push(normalized);
  }

  return next;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { authenticatedFetch, signOut, user } = useAuth();
  const { state } = useAppState();
  const {
    theme, setTheme,
    fontFamily, setFontFamily,
    fontSize, setFontSize,
    density, setDensity,
    preferredUpdateTime, setPreferredUpdateTime,
  } = usePreferences();
  const { showToast } = useToast();

  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordsLoading, setKeywordsLoading] = useState(true);
  const [keywordsSaving, setKeywordsSaving] = useState(false);
  const [keywordBeingRemoved, setKeywordBeingRemoved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadKeywords() {
      try {
        setKeywordsLoading(true);
        const res = await authenticatedFetch("/api/user/keywords");
        if (!res.ok) {
          throw new Error(`Failed to load keywords (${res.status})`);
        }

        const data = (await res.json()) as string[];
        if (cancelled) return;

        setKeywords(mergeKeywords(Array.isArray(data) ? data : []));
      } catch (error) {
        console.error("Failed to load keywords:", error);
        if (!cancelled) {
          showToast("Could not load your keywords.", "error");
        }
      } finally {
        if (!cancelled) {
          setKeywordsLoading(false);
        }
      }
    }

    void loadKeywords();

    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch, showToast]);

  async function addKeywordsFromInput() {
    const incoming = keywordInput
      .split(",")
      .map(normalizeKeyword)
      .filter(Boolean);

    if (incoming.length === 0) return;

    const existing = new Set(keywords.map((keyword) => keyword.toLowerCase()));
    const pending = mergeKeywords(incoming).filter((keyword) => !existing.has(keyword.toLowerCase()));

    if (pending.length === 0) {
      setKeywordInput("");
      return;
    }

    try {
      setKeywordsSaving(true);

      for (const keyword of pending) {
        const res = await authenticatedFetch("/api/user/keywords", {
          method: "POST",
          body: JSON.stringify({
            keyword,
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to save keyword (${res.status})`);
        }
      }

      setKeywords((prev) => mergeKeywords([...prev, ...pending]));
      setKeywordInput("");
    } catch (error) {
      console.error("Failed to save keywords:", error);
      showToast("Could not save keyword.", "error");
    } finally {
      setKeywordsSaving(false);
    }
  }

  async function removeKeyword(keywordToRemove: string) {
    try {
      setKeywordBeingRemoved(keywordToRemove);

      const res = await authenticatedFetch("/api/user/keywords", {
        method: "DELETE",
        body: JSON.stringify({
          keyword: keywordToRemove,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to remove keyword (${res.status})`);
      }

      setKeywords((prev) =>
        prev.filter((keyword) => keyword.toLowerCase() !== keywordToRemove.toLowerCase())
      );
    } catch (error) {
      console.error("Failed to remove keyword:", error);
      showToast("Could not remove keyword.", "error");
    } finally {
      setKeywordBeingRemoved(null);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 24px 64px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2
          style={{ fontSize: 20, fontWeight: 700, color: "var(--sg-text)", letterSpacing: "-0.3px" }}
        >
          Settings
        </h2>
        <p style={{ fontSize: 13, color: "var(--sg-muted)", marginTop: 4 }}>
          Manage your account and application preferences.
        </p>
      </div>

      {/* ── Section 1: Account ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel>Account</SectionLabel>
        <SectionCard>
          {/* Avatar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 18px",
              borderBottom: "1px solid var(--sg-border)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                backgroundColor: "var(--sg-logo-bg, #2c2c2a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{ fontSize: 16, fontWeight: 700, color: "var(--sg-logo-color, #fff)" }}
              >
                {(user?.username?.slice(0, 1) ?? "S").toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sg-text)" }}>
                {user?.username ?? "Signal User"}
              </div>
              <div style={{ fontSize: 12, color: "var(--sg-muted)", marginTop: 1 }}>
                {user?.email ?? "No email available"}
              </div>
            </div>
            <button
              onClick={signOut}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--sg-muted)",
                backgroundColor: "transparent",
                border: "1px solid var(--sg-border)",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </div>

          {/* Read-only fields */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 0,
            }}
          >
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--sg-border)", borderRight: "1px solid var(--sg-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sg-muted)", marginBottom: 4 }}>
                Username
              </div>
              <div style={{ fontSize: 13.5, color: "var(--sg-text)", fontWeight: 500 }}>
                {user?.username ?? "Unavailable"}
              </div>
            </div>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--sg-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sg-muted)", marginBottom: 4 }}>
                Email
              </div>
              <div style={{ fontSize: 13.5, color: "var(--sg-text)", fontWeight: 500 }}>
                {user?.email ?? "Unavailable"}
              </div>
            </div>
            <div style={{ padding: "13px 18px", gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sg-muted)", marginBottom: 4 }}>
                Sources
              </div>
              <div style={{ fontSize: 13.5, color: "var(--sg-text)", fontWeight: 500 }}>
                {Math.max(state.sources.length, user?.websites.length ?? 0)}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Section 2: Keywords ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel>Keywords</SectionLabel>
        <SectionCard>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
              <Tags style={{ width: 14, height: 14, color: "var(--sg-muted)" }} />
              <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sg-text)" }}>
                Topics You Want More Of
              </span>
            </div>

            <p style={{ fontSize: 12.5, color: "var(--sg-muted)", lineHeight: 1.6, margin: "0 0 12px 0" }}>
              Add company names, sectors, technologies, or topics. Press Enter or separate multiple keywords with commas.
            </p>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    void addKeywordsFromInput();
                  }
                }}
                placeholder="AI agents, OpenAI, semiconductors..."
                disabled={keywordsLoading || keywordsSaving}
                style={{
                  flex: 1,
                  minWidth: 220,
                  fontSize: 13.5,
                  color: "var(--sg-text)",
                  backgroundColor: "var(--sg-surface-hover)",
                  border: "1px solid var(--sg-border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  outline: "none",
                  fontFamily: "var(--font-inter, Inter, sans-serif)",
                }}
              />
              <button
                onClick={() => void addKeywordsFromInput()}
                disabled={keywordsLoading || keywordsSaving}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--sg-fab-color, #fff)",
                  backgroundColor: "var(--sg-fab-bg, var(--sg-text))",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 14px",
                  cursor: keywordsLoading || keywordsSaving ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  opacity: keywordsLoading || keywordsSaving ? 0.6 : 1,
                }}
              >
                {keywordsSaving ? "Saving..." : "Add Keyword"}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 14,
                minHeight: keywords.length > 0 ? undefined : 22,
              }}
            >
              {keywordsLoading ? (
                <span style={{ fontSize: 12, color: "var(--sg-muted)" }}>
                  Loading keywords...
                </span>
              ) : keywords.length > 0 ? (
                keywords.map((keyword) => (
                  <div
                    key={keyword}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      color: "var(--sg-text)",
                      backgroundColor: "var(--sg-nav-active)",
                      border: "1px solid var(--sg-border)",
                      borderRadius: 999,
                      padding: "6px 10px",
                    }}
                  >
                    <span>{keyword}</span>
                    <button
                      onClick={() => void removeKeyword(keyword)}
                      aria-label={`Remove ${keyword}`}
                      disabled={keywordBeingRemoved === keyword}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 16,
                        height: 16,
                        padding: 0,
                        border: "none",
                        background: "none",
                        color: "var(--sg-muted)",
                        cursor: keywordBeingRemoved === keyword ? "not-allowed" : "pointer",
                        borderRadius: "50%",
                        opacity: keywordBeingRemoved === keyword ? 0.5 : 1,
                      }}
                    >
                      <X style={{ width: 11, height: 11 }} />
                    </button>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--sg-muted)" }}>
                  No keywords yet.
                </span>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Section 3: Appearance ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel>Appearance</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Theme */}
          <SectionCard>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                <Sun style={{ width: 14, height: 14, color: "var(--sg-muted)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sg-text)" }}>Theme</span>
              </div>
              <ThemePicker value={theme} onChange={setTheme} />
            </div>
          </SectionCard>

          {/* Font Family */}
          <SectionCard>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                <Type style={{ width: 14, height: 14, color: "var(--sg-muted)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sg-text)" }}>Font Family</span>
              </div>
              <FontPicker value={fontFamily} onChange={setFontFamily} />
            </div>
          </SectionCard>

          {/* Font Size */}
          <SectionCard>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Type style={{ width: 14, height: 14, color: "var(--sg-muted)" }} />
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sg-text)" }}>Font Size</span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--sg-text)",
                    backgroundColor: "var(--sg-nav-active)",
                    border: "1px solid var(--sg-border)",
                    borderRadius: 5,
                    padding: "2px 8px",
                    fontFamily: "var(--font-jetbrains-mono, monospace)",
                  }}
                >
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={14}
                max={20}
                step={1}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                aria-label="Font size"
                style={{ width: "100%", accentColor: "var(--sg-text)", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10.5, color: "var(--sg-muted)" }}>14px</span>
                <span style={{ fontSize: 10.5, color: "var(--sg-muted)" }}>20px</span>
              </div>
              {/* Live preview */}
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  borderRadius: 7,
                  backgroundColor: "var(--sg-bg)",
                  border: "1px solid var(--sg-border)",
                }}
              >
                <p
                  style={{
                    fontSize: `${fontSize}px`,
                    color: "var(--sg-text)",
                    lineHeight: 1.55,
                    margin: 0,
                    opacity: 0.85,
                    transition: "font-size 0.1s ease",
                  }}
                >
                  Signal distills the web&apos;s noise into clear, concise summaries you can actually use.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Density */}
          <SectionCard>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                <AlignJustify style={{ width: 14, height: 14, color: "var(--sg-muted)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sg-text)" }}>Layout Density</span>
              </div>
              <DensityToggle value={density} onChange={setDensity} />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Section 4: Feed Schedule ── */}
      <div>
        <SectionLabel>Feed Schedule</SectionLabel>
        <SectionCard>
          <SettingRow
            label="Preferred Update Time"
            description="Signal will refresh your sources around this time daily"
            noBorder
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock style={{ width: 13, height: 13, color: "var(--sg-muted)", flexShrink: 0 }} />
              <select
                value={preferredUpdateTime}
                onChange={(e) => setPreferredUpdateTime(e.target.value)}
                aria-label="Preferred update time"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--sg-text)",
                  backgroundColor: "var(--sg-surface-hover)",
                  border: "1px solid var(--sg-border)",
                  borderRadius: 7,
                  padding: "5px 10px",
                  cursor: "pointer",
                  outline: "none",
                  appearance: "auto",
                  fontFamily: "var(--font-inter, Inter, sans-serif)",
                }}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </SettingRow>
        </SectionCard>
      </div>
    </div>
  );
}
