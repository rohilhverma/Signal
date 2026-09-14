"use client";

// ─── Stats ─────────────────────────────────────────────────────────────────────
//
// Self-contained, same shape as HotTopicsView: its own fetch, its own loading and
// error state, mounted in one conditional block in DashboardPage. It does not touch
// the article-pool machinery (expandedIds, summaryModes, articlePool) because it isn't
// an article feed - it reads GET /api/user/stats and renders numbers.

import { useEffect, useState } from "react";
import { Flame, Trophy } from "lucide-react";

import { useAuth } from "../context/AuthContext";

type StatsResponse = {
  currentStreakDays: number;
  longestStreakDays: number;
  totalActiveDays: number;
  totalArticlesEngaged: number;
  bySource: Record<string, number>;
  /** ISO date strings ("2026-08-29"), most recent first, capped server-side at 120. */
  activeDates: string[];
  /**
   * Strongest topics first, capped server-side at 8. `weight` is a half-life-decayed
   * affinity score - it exists to size the bars relative to each other and means nothing
   * on its own, so `articleCount` is what gets shown.
   */
  topTopics: { label: string; weight: number; articleCount: number }[];
};

/** Bare-domain -> readable name. Falls back to the domain itself for an unknown source. */
function sourceLabel(websiteUrl: string): string {
  const known: Record<string, string> = {
    "www.techcrunch.com": "TechCrunch",
    "www.arstechnica.com": "Ars Technica",
    "www.theverge.com": "The Verge",
  };
  return known[websiteUrl] ?? websiteUrl.replace(/^www\./, "");
}

export function StatsPage() {
  const { authenticatedFetch } = useAuth();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authenticatedFetch("/api/user/stats");
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const payload = (await res.json()) as StatsResponse;
        if (!cancelled) setStats(payload);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "var(--sg-muted)", fontSize: 13.5 }}>
        Couldn&apos;t load stats. Try again shortly.
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "var(--sg-muted)", fontSize: 13.5 }}>
        Loading…
      </div>
    );
  }

  const sourceEntries = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
  const maxSourceCount = Math.max(1, ...sourceEntries.map(([, n]) => n));

  // Already sorted by the server; the max is only needed to scale the bars.
  const topTopics = stats.topTopics ?? [];
  const maxTopicWeight = Math.max(1, ...topTopics.map(t => t.weight));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatTile
          icon={<Flame style={{ width: 18, height: 18 }} />}
          value={stats.currentStreakDays}
          label={stats.currentStreakDays === 1 ? "day streak" : "day streak"}
          accent
        />
        <StatTile
          icon={<Trophy style={{ width: 18, height: 18 }} />}
          value={stats.longestStreakDays}
          label="longest streak"
        />
        <StatTile value={stats.totalActiveDays} label="active days" />
        <StatTile value={stats.totalArticlesEngaged} label="articles read" />
      </div>

      {stats.currentStreakDays === 0 && stats.longestStreakDays > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--sg-muted)", margin: 0 }}>
          Your streak reset — read something today to start a new one.
        </p>
      )}

      <ActivityHeatmap activeDates={stats.activeDates} />

      <div>
        <SectionHeader>Your top topics</SectionHeader>
        {topTopics.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topTopics.map(topic => (
              <BarRow
                key={topic.label}
                label={topic.label}
                fraction={topic.weight / maxTopicWeight}
                count={topic.articleCount}
              />
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--sg-muted)", margin: 0 }}>
            Read a few more articles and the topics you keep coming back to will show up here.
          </p>
        )}
      </div>

      {sourceEntries.length > 0 && (
        <div>
          <SectionHeader>Read by source</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sourceEntries.map(([source, count]) => (
              <BarRow
                key={source}
                label={sourceLabel(source)}
                fraction={count / maxSourceCount}
                count={count}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.11em",
        textTransform: "uppercase",
        color: "var(--sg-muted)",
        opacity: 0.7,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

/**
 * One labelled bar. `fraction` is already normalised against the list's own maximum, so
 * the longest bar in any list is full width - these are relative comparisons within a
 * section, never across sections.
 *
 * A zero `count` renders as blank rather than "0". Topic rows written before the article
 * counter existed report 0, and a column of zeroes beside real bars reads as broken
 * rather than as "not counted yet"; the space is still reserved so the bars stay aligned.
 */
function BarRow({ label, fraction, count }: { label: string; fraction: number; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          fontSize: 13,
          color: "var(--sg-text)",
          width: 120,
          flexShrink: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={label}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          backgroundColor: "var(--sg-border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
            height: "100%",
            backgroundColor: "var(--sg-accent)",
            borderRadius: 4,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          color: "var(--sg-muted)",
          width: 28,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count > 0 ? count : ""}
      </span>
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
  accent = false,
}: {
  icon?: React.ReactNode;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        flex: "1 1 120px",
        minWidth: 120,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid var(--sg-border)",
        backgroundColor: "var(--sg-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 24,
          fontWeight: 700,
          color: accent ? "var(--sg-accent)" : "var(--sg-text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {icon}
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--sg-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

/**
 * A GitHub-style contribution strip: one cell per day for the last 12 weeks, filled if
 * that day is in `activeDates`. Deliberately not a full calendar grid - at personal-app
 * scale (weeks, not a full year of history) a single row reads better than a 7-row grid
 * with mostly empty space.
 */
function ActivityHeatmap({ activeDates }: { activeDates: string[] }) {
  const active = new Set(activeDates);
  const days: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 83; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  return (
    <div>
      <SectionHeader>Last 12 weeks</SectionHeader>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {days.map(day => {
          const isActive = active.has(day);
          return (
            <div
              key={day}
              title={day}
              style={{
                width: 11,
                height: 11,
                borderRadius: 2,
                backgroundColor: isActive ? "var(--sg-accent)" : "var(--sg-border)",
                opacity: isActive ? 1 : 0.5,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
