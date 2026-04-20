export const DEFAULT_ACCENT = "#6b7280";

export interface Source {
  id: string;
  name: string;
  domain: string;
  faviconUrl: string;
  accentColor: string;
  paywall?: string | null;
}

export type SummaryMode = "short" | "default" | "deepDive";

export interface Article {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  // Three summary variants — null means not yet fetched
  summaryShort: string | null;
  summaryDefault: string;
  summaryDeepDive: string | null;
  publishedAt: Date;
  processedAt: Date;
  originalWordCount: number;
  summaryWordCount: number;
}
