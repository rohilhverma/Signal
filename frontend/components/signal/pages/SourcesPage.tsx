"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Globe, Newspaper, ChevronDown } from "lucide-react";
import { useAppState, type ContentProfile } from "../context/AppStateContext";
import { useToast } from "../context/ToastContext";
import { usePreferences } from "../context/PreferencesContext";
import { DEFAULT_ACCENT } from "../data/mockArticles";

// ─── Utilities ───────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return "https://" + trimmed;
  }
  return trimmed;
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(normalizeUrl(raw));
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function nameFromDomain(domain: string): string {
  return domain
    .split(".")
    .slice(0, -1)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ─── Content Profile Dropdown ─────────────────────────────────────────────────

const PROFILE_OPTIONS: { key: ContentProfile; label: string; description: string }[] = [
  { key: "short", label: "Short", description: "3-bullet summary" },
  { key: "standard", label: "Standard", description: "2-3 sentence digest" },
  { key: "deepDive", label: "Deep Dive", description: "Full analysis" },
];

function ProfileDropdown({
  value,
  onChange,
}: {
  value: ContentProfile;
  onChange: (v: ContentProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = PROFILE_OPTIONS.find((o) => o.key === value)!;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--sg-text)",
          backgroundColor: "var(--sg-surface-hover)",
          border: "1px solid var(--sg-border)",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background-color 0.12s ease",
          minWidth: 98,
          justifyContent: "space-between",
        }}
      >
        {current.label}
        <ChevronDown style={{ width: 11, height: 11, color: "var(--sg-muted)", flexShrink: 0 }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "fixed",
            top: dropdownPos.top,
            right: dropdownPos.right,
            zIndex: 9999,
            minWidth: 160,
            backgroundColor: "var(--sg-surface)",
            border: "1px solid var(--sg-border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          {PROFILE_OPTIONS.map((opt) => {
            const isActive = opt.key === value;
            return (
              <button
                key={opt.key}
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  width: "100%",
                  padding: "8px 12px",
                  background: isActive ? "var(--sg-nav-active)" : "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  borderLeft: isActive ? "2px solid var(--sg-text)" : "2px solid transparent",
                  transition: "background-color 0.12s ease",
                }}
                onMouseEnter={(e) =>
                  !isActive &&
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--sg-surface-hover)")
                }
                onMouseLeave={(e) =>
                  !isActive &&
                  ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")
                }
              >
                <span style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 500, color: "var(--sg-text)" }}>
                  {opt.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--sg-muted)", marginTop: 1 }}>
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <span style={{ fontSize: 11.5, color: "var(--sg-muted)" }}>Remove this source?</span>
      <button
        onClick={onConfirm}
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 5,
          padding: "3px 8px",
          cursor: "pointer",
        }}
      >
        Yes
      </button>
      <button
        onClick={onCancel}
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--sg-muted)",
          backgroundColor: "transparent",
          border: "1px solid var(--sg-border)",
          borderRadius: 5,
          padding: "3px 8px",
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}

// ─── Source Row ───────────────────────────────────────────────────────────────

function SourceRow({
  source,
  isCompact,
}: {
  source: import("../context/AppStateContext").ManagedSource;
  isCompact: boolean;
}) {
  const { setSourceProfile, removeSource } = useAppState();
  const { showToast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [faviconErrored, setFaviconErrored] = useState(false);
  const accent = source.accentColor ?? DEFAULT_ACCENT;

  const handleDelete = async () => {
    await fetch("/api/user/url", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "rohil", websiteURL: source.id }),
    });
    removeSource(source.id);
    showToast(`Removed "${source.name}"`, "info");
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: isCompact ? "10px 16px" : "13px 18px",
        borderBottom: "1px solid var(--sg-border)",
        borderLeft: `3px solid ${accent}`,
        transition: "background-color 0.12s ease",
        backgroundColor: "var(--sg-surface)",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--sg-surface-hover)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--sg-surface)")
      }
    >
      {/* Favicon bubble */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          border: `1.5px solid ${accent}44`,
          backgroundColor: `${accent}12`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {faviconErrored ? (
          <Globe style={{ width: 14, height: 14, color: accent }} />
        ) : (
          <img
            src={source.faviconUrl}
            alt={source.name}
            width={32}
            height={32}
            crossOrigin="anonymous"
            onError={() => setFaviconErrored(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>

      {/* Source info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sg-text)", lineHeight: 1.3 }}>
            {source.name}
          </span>
          {source.paywall === "true" && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#b45309",
              backgroundColor: "rgba(217,119,6,0.12)",
              borderRadius: 99,
              padding: "1px 7px",
            }}>
              Paywalled
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--sg-muted)", marginTop: 1 }}>
          {source.domain}
          <span style={{ margin: "0 5px", color: "var(--sg-border)" }}>·</span>
          <span style={{ color: "var(--sg-muted)" }}>
            {source.articleCount === 0
              ? "No articles yet"
              : `${source.articleCount} article${source.articleCount !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* Right-side controls */}
      {confirmDelete ? (
        <DeleteConfirm onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />
      ) : (
        <>
          <ProfileDropdown
            value={source.contentProfile}
            onChange={(profile) => {
              setSourceProfile(source.id, profile);
              showToast(`"${source.name}" set to ${PROFILE_OPTIONS.find((o) => o.key === profile)!.label}`, "success");
            }}
          />
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label={`Remove ${source.name}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 6,
              border: "1px solid var(--sg-border)",
              backgroundColor: "transparent",
              color: "var(--sg-muted)",
              cursor: "pointer",
              flexShrink: 0,
              transition: "color 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget as HTMLElement;
              btn.style.color = "#ef4444";
              btn.style.borderColor = "rgba(239,68,68,0.3)";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLElement;
              btn.style.color = "var(--sg-muted)";
              btn.style.borderColor = "var(--sg-border)";
            }}
          >
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SourcesPage() {
  const { state, addSource } = useAppState();
  const { showToast } = useToast();
  const { density } = usePreferences();
  const isCompact = density === "compact";

  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newSourceProfile, setNewSourceProfile] = useState<ContentProfile>("standard");

  const handleAdd = async () => {
    const trimmed = normalizeUrl(urlInput);
    if (!isValidUrl(trimmed)) {
      setUrlError("Please enter a valid URL");
      return;
    }
    setUrlError(null);
    setAdding(true);

    try {
      await fetch("/api/user/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "rohil", websiteURL: trimmed, websiteContentMode: newSourceProfile }),
      });

      const domain = domainFromUrl(trimmed);
      const name = nameFromDomain(domain);
      const newSource = {
        id: trimmed,
        name,
        domain,
        faviconUrl: `https://www.google.com/s2/favicons?sz=64&domain=${domain}`,
        accentColor: DEFAULT_ACCENT,
        contentProfile: newSourceProfile,
      };
      addSource(newSource);
      localStorage.setItem("pendingFeedUpdate", "true");
      setUrlInput("");
      setNewSourceProfile("standard");
      showToast(`Added "${name}"`, "success");
    } finally {
      setAdding(false);
    }
  };

  const hasSources = state.sources.length > 0;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: isCompact ? "20px 16px" : "28px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: isCompact ? "20px" : "28px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--sg-text)", letterSpacing: "-0.3px" }}>
          Manage Sources
        </h2>
        <p style={{ fontSize: 13, color: "var(--sg-muted)", marginTop: 4 }}>
          {state.sources.length} source{state.sources.length !== 1 ? "s" : ""} configured
        </p>
      </div>

      {/* Add source form */}
      <div
        style={{
          backgroundColor: "var(--sg-surface)",
          border: "1px solid var(--sg-border)",
          borderRadius: 10,
          padding: isCompact ? "14px 16px" : "18px 20px",
          marginBottom: isCompact ? "20px" : "28px",
        }}
      >
        <label
          style={{ fontSize: 12, fontWeight: 600, color: "var(--sg-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}
          htmlFor="source-url-input"
        >
          Add a source
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            id="source-url-input"
            type="url"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (urlError) setUrlError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && !adding && handleAdd()}
            placeholder="Enter a website URL, e.g. https://techcrunch.com"
            style={{
              flex: 1,
              fontSize: 13.5,
              color: "var(--sg-text)",
              backgroundColor: "var(--sg-bg)",
              border: `1px solid ${urlError ? "rgba(239,68,68,0.5)" : "var(--sg-border)"}`,
              borderRadius: 7,
              padding: "8px 12px",
              outline: "none",
              transition: "border-color 0.15s ease",
              fontFamily: "var(--font-inter, Inter, sans-serif)",
            }}
            onFocus={(e) => {
              if (!urlError) (e.currentTarget as HTMLElement).style.borderColor = "var(--sg-accent)";
            }}
            onBlur={(e) => {
              if (!urlError) (e.currentTarget as HTMLElement).style.borderColor = "var(--sg-border)";
            }}
          />
          <ProfileDropdown value={newSourceProfile} onChange={setNewSourceProfile} />
          <button
            onClick={handleAdd}
            disabled={adding}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--sg-fab-color, #fff)",
              backgroundColor: "var(--sg-fab-bg, var(--sg-text))",
              border: "none",
              borderRadius: 7,
              padding: "8px 16px",
              cursor: adding ? "not-allowed" : "pointer",
              opacity: adding ? 0.6 : 1,
              transition: "opacity 0.15s ease",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add Source
          </button>
        </div>
        {urlError && (
          <p style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>{urlError}</p>
        )}
      </div>

      {/* Sources list */}
      {hasSources ? (
        <div
          style={{
            border: "1px solid var(--sg-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {state.sources.map((source, idx) => (
            <div
              key={source.id}
              style={{
                borderBottom: idx < state.sources.length - 1 ? "none" : undefined,
              }}
            >
              <SourceRow source={source} isCompact={isCompact} />
            </div>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "64px 32px",
            textAlign: "center",
            border: "1px dashed var(--sg-border)",
            borderRadius: 10,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: "var(--sg-accent-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Newspaper style={{ width: 28, height: 28, color: "var(--sg-text)", opacity: 0.45 }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--sg-text)", marginBottom: 6, letterSpacing: "-0.2px" }}>
            No sources yet
          </h3>
          <p style={{ fontSize: 13.5, color: "var(--sg-muted)", lineHeight: 1.6, maxWidth: 260 }}>
            Add your first news source above to get started
          </p>
        </div>
      )}
    </div>
  );
}
