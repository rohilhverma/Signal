"use client";

import { useState } from "react";
import { Sun, Moon, Coffee, Type, AlignJustify, Clock } from "lucide-react";
import { usePreferences, type Theme, type FontFamily, type Density } from "../context/PreferencesContext";

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const {
    theme, setTheme,
    fontFamily, setFontFamily,
    fontSize, setFontSize,
    density, setDensity,
  } = usePreferences();

  const [preferredTime, setPreferredTime] = useState("7:00 AM");

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
                A
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sg-text)" }}>Alex Reader</div>
              <div style={{ fontSize: 12, color: "var(--sg-muted)", marginTop: 1 }}>alex@signal.app</div>
            </div>
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
              <div style={{ fontSize: 13.5, color: "var(--sg-text)", fontWeight: 500 }}>alex_reader</div>
            </div>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--sg-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sg-muted)", marginBottom: 4 }}>
                Email
              </div>
              <div style={{ fontSize: 13.5, color: "var(--sg-text)", fontWeight: 500 }}>alex@signal.app</div>
            </div>
            <div style={{ padding: "13px 18px", borderRight: "1px solid var(--sg-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sg-muted)", marginBottom: 4 }}>
                Member since
              </div>
              <div style={{ fontSize: 13.5, color: "var(--sg-text)", fontWeight: 500 }}>January 2026</div>
            </div>
            <div style={{ padding: "13px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sg-muted)", marginBottom: 4 }}>
                Plan
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 13.5, color: "var(--sg-text)", fontWeight: 500 }}>Free</div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#f59e0b",
                    backgroundColor: "rgba(245,158,11,0.1)",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  Beta
                </span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Section 2: Appearance ── */}
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

      {/* ── Section 3: Feed Schedule ── */}
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
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
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
