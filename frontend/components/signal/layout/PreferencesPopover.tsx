"use client";

import * as Popover from "@radix-ui/react-popover";
import * as Slider from "@radix-ui/react-slider";
import { Settings2 } from "lucide-react";
import { usePreferences, FontFamily, Density, ViewMode } from "../context/PreferencesContext";

// ─── Shared segment button style ────────────────────────────────────────────

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "5px 0",
        fontSize: "12px",
        fontWeight: active ? 500 : 400,
        fontFamily: "var(--font-inter, Inter, sans-serif)",
        color: active ? "var(--sg-accent)" : "var(--sg-muted)",
        backgroundColor: active ? "var(--sg-accent-subtle)" : "transparent",
        border: "1px solid",
        borderColor: active ? "var(--sg-accent)" : "var(--sg-border)",
        borderRadius: "5px",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "10.5px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--sg-muted)",
        marginBottom: "6px",
        fontFamily: "var(--font-inter, Inter, sans-serif)",
      }}
    >
      {children}
    </p>
  );
}

// ─── Preferences Popover ─────────────────────────────────────────────────────

export function PreferencesPopover() {
  const {
    fontFamily, setFontFamily,
    fontSize, setFontSize,
    density, setDensity,
    viewMode, setViewMode,
  } = usePreferences();

  const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
    { value: "sans", label: "Sans" },
    { value: "serif", label: "Serif" },
    { value: "mono", label: "Mono" },
  ];

  const DENSITY_OPTIONS: { value: Density; label: string }[] = [
    { value: "comfortable", label: "Comfortable" },
    { value: "compact", label: "Compact" },
  ];

  const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
    { value: "feed", label: "Feed" },
    { value: "reader", label: "Reader" },
  ];

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="Open preferences"
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
          style={{
            color: "var(--sg-muted)",
            backgroundColor: "transparent",
            border: "1px solid var(--sg-border)",
          }}
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50"
          style={{
            width: 256,
            padding: "16px",
            borderRadius: "10px",
            backgroundColor: "var(--sg-surface)",
            border: "1px solid var(--sg-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          {/* Font Family */}
          <div style={{ marginBottom: "16px" }}>
            <SectionLabel>Font Family</SectionLabel>
            <div style={{ display: "flex", gap: "4px" }}>
              {FONT_OPTIONS.map((opt) => (
                <SegmentButton
                  key={opt.value}
                  active={fontFamily === opt.value}
                  onClick={() => setFontFamily(opt.value)}
                >
                  {opt.label}
                </SegmentButton>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <SectionLabel>Text Size</SectionLabel>
              <span style={{ fontSize: "11px", color: "var(--sg-muted)", fontFamily: "var(--font-inter, Inter, sans-serif)" }}>
                {fontSize}px
              </span>
            </div>
            <Slider.Root
              min={14}
              max={20}
              step={1}
              value={[fontSize]}
              onValueChange={([v]) => setFontSize(v)}
              className="relative flex items-center select-none touch-none w-full h-5"
            >
              <Slider.Track
                className="relative grow rounded-full h-[3px]"
                style={{ backgroundColor: "var(--sg-border)" }}
              >
                <Slider.Range
                  className="absolute rounded-full h-full"
                  style={{ backgroundColor: "var(--sg-accent)" }}
                />
              </Slider.Track>
              <Slider.Thumb
                className="block w-4 h-4 rounded-full shadow cursor-pointer focus:outline-none"
                style={{
                  backgroundColor: "var(--sg-accent)",
                  border: "2px solid white",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }}
                aria-label="Font size"
              />
            </Slider.Root>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "10px", color: "var(--sg-muted)", fontFamily: "var(--font-inter, Inter, sans-serif)" }}>14px</span>
              <span style={{ fontSize: "10px", color: "var(--sg-muted)", fontFamily: "var(--font-inter, Inter, sans-serif)" }}>20px</span>
            </div>
          </div>

          {/* Layout Density */}
          <div style={{ marginBottom: "16px" }}>
            <SectionLabel>Layout Density</SectionLabel>
            <div style={{ display: "flex", gap: "4px" }}>
              {DENSITY_OPTIONS.map((opt) => (
                <SegmentButton
                  key={opt.value}
                  active={density === opt.value}
                  onClick={() => setDensity(opt.value)}
                >
                  {opt.label}
                </SegmentButton>
              ))}
            </div>
          </div>

          {/* View Mode */}
          <div>
            <SectionLabel>View Mode</SectionLabel>
            <div style={{ display: "flex", gap: "4px" }}>
              {VIEW_OPTIONS.map((opt) => (
                <SegmentButton
                  key={opt.value}
                  active={viewMode === opt.value}
                  onClick={() => setViewMode(opt.value)}
                >
                  {opt.label}
                </SegmentButton>
              ))}
            </div>
          </div>

          <Popover.Arrow style={{ fill: "var(--sg-border)" }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
