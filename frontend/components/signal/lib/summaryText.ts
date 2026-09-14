// ─── Summary text parsing ─────────────────────────────────────────────────────
//
// Cleans up whatever the Gemini-backed summarizer stored in a summary column. It
// doesn't always store plain text — a JSON array, a JSON object, a JSON-encoded
// string wrapper, or a malformed near-JSON blob have all shown up in the database at
// one point or another — so this is defensive by necessity, not by choice.
//
// Extracted out of DashboardPage so any other view reading raw article fields from
// the API (search, For You) can clean them up the same way instead of re-deriving
// this parsing, or worse, reading the unparsed value and rendering "Gemini error:
// ..." straight into a card.

function normalizeSummaryValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const lines = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : null;
  }

  return null;
}

export function extractSummaryText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!trimmed) return null;

  if (/^(Gemini error:|Cache miss:)/i.test(trimmed)) {
    return null;
  }

  // JSON string wrapper: "\"[{\\\"summary\\\":\\\"...\\\"}]\""
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const unwrapped = JSON.parse(trimmed) as string;
      if (typeof unwrapped === "string" && unwrapped !== trimmed) {
        return extractSummaryText(unwrapped);
      }
    } catch {}
  }

  // JSON array: [{"title":"...","summary":"..."}]
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{ summary?: unknown }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeSummaryValue(parsed[0]?.summary);
      }
    } catch {}
  }

  // JSON object (Gemini sometimes returns an object instead of an array):
  // {"title":"...","summary":"..."} or {"summary":"..."}
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { summary?: unknown };
      return normalizeSummaryValue(parsed?.summary);
    } catch {}
  }

  // Fallback for Gemini's malformed JSON-ish responses, e.g.
  // [{title:'...',summary:'...'}] or {"summary":"..."} with escaping issues.
  const summaryFieldMatch = trimmed.match(
    /["']summary["']\s*:\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)')/
  );
  const summaryField = summaryFieldMatch?.[1] ?? summaryFieldMatch?.[2];
  if (summaryField) {
    return summaryField
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'")
      .trim() || null;
  }

  // Plain text — return as-is
  return trimmed || null;
}
