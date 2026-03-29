export const SOURCE_ACCENT_COLORS: Record<string, string> = {
  techcrunch: "#0a9e01",
  theverge: "#e052a0",
  arstechnica: "#ff4e00",
};

export const DEFAULT_ACCENT = "#6b7280";

export interface Source {
  id: string;
  name: string;
  domain: string;
  faviconUrl: string;
  accentColor: string;
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
  originalWordCount: number;
  summaryWordCount: number;
}

// All times are relative to "now" so aging is always visible
const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

export const MOCK_SOURCES: Source[] = [
  {
    id: "techcrunch",
    name: "TechCrunch",
    domain: "techcrunch.com",
    faviconUrl: "https://techcrunch.com/wp-content/uploads/2015/02/cropped-cropped-favicon-gradient.png",
    accentColor: SOURCE_ACCENT_COLORS.techcrunch,
  },
  {
    id: "theverge",
    name: "The Verge",
    domain: "theverge.com",
    faviconUrl: "https://cdn.vox-cdn.com/uploads/chorus_asset/file/7395359/favicon-64x64.0.png",
    accentColor: SOURCE_ACCENT_COLORS.theverge,
  },
  {
    id: "arstechnica",
    name: "Ars Technica",
    domain: "arstechnica.com",
    faviconUrl: "https://cdn.arstechnica.net/favicon.ico",
    accentColor: SOURCE_ACCENT_COLORS.arstechnica,
  },
];

export const MOCK_ARTICLES: Article[] = [
  // TechCrunch — mix of ages
  {
    id: "tc-1",
    sourceId: "techcrunch",
    title: "OpenAI launches GPT-5 mini with aggressive pricing to undercut Anthropic",
    url: "https://techcrunch.com/",
    summaryShort: null, // fetched on demand
    summaryDefault:
      "OpenAI announced GPT-5 mini at $0.15 per million input tokens, dramatically undercutting competitors. The model retains 94% of GPT-5's reasoning quality on standard benchmarks while cutting costs by 83%, making it the most economical frontier model for high-throughput applications.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(1),
    originalWordCount: 1840,
    summaryWordCount: 52,
  },
  {
    id: "tc-2",
    sourceId: "techcrunch",
    title: "Y Combinator's W26 batch breaks record with 412 funded startups",
    url: "https://techcrunch.com/",
    summaryShort: null,
    summaryDefault:
      "The Winter 2026 cohort is the largest in YC's history, with AI infrastructure and biotech dominating at 38% and 21% of companies respectively. Total initial funding across the batch exceeds $820M, reflecting a sharp reversal of the 2023-2024 seed-stage contraction.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(3),
    originalWordCount: 2200,
    summaryWordCount: 61,
  },
  {
    id: "tc-3",
    sourceId: "techcrunch",
    title: "Stripe acquires Lemon Squeezy to expand into creator commerce",
    url: "https://techcrunch.com/",
    summaryShort: null,
    summaryDefault:
      "Stripe's acquisition of the developer-friendly merchant of record platform signals an expansion into the $250B creator economy. Lemon Squeezy handles tax compliance and global payouts for over 50,000 indie developers and will be integrated into Stripe's dashboard by Q3.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(8),
    originalWordCount: 1650,
    summaryWordCount: 58,
  },
  {
    id: "tc-4",
    sourceId: "techcrunch",
    title: "Waymo expands robotaxi service to Miami, its first East Coast market",
    url: "https://techcrunch.com/",
    summaryShort: null,
    summaryDefault:
      "Alphabet's autonomous vehicle subsidiary is launching a limited commercial service in Miami's Brickell and Wynwood districts with an initial fleet of 50 vehicles. The expansion marks a significant geographic milestone as Waymo navigates different regulatory frameworks across states.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(26),
    originalWordCount: 2100,
    summaryWordCount: 55,
  },

  // The Verge — mix of ages
  {
    id: "tv-1",
    sourceId: "theverge",
    title: "Apple's Vision Pro 2 leaks: pancake lenses, 40% lighter, $2,499 price tag",
    url: "https://www.theverge.com/",
    summaryShort: null,
    summaryDefault:
      "Internal supply chain documents reviewed by The Verge reveal Apple's next spatial computer uses a pancake lens optical system, reducing the headset's weight from 600g to roughly 360g. The new custom display chips produce 4,000 nits peak brightness with improved eye-tracking latency under 2ms.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(2),
    originalWordCount: 3100,
    summaryWordCount: 68,
  },
  {
    id: "tv-2",
    sourceId: "theverge",
    title: "Google's NotebookLM adds real-time web grounding, ends hallucination problem",
    url: "https://www.theverge.com/",
    summaryShort: null,
    summaryDefault:
      "NotebookLM's new live-web mode retrieves and cites sources at inference time rather than relying solely on uploaded documents, effectively turning it into a research assistant with up-to-date knowledge. Google says citation accuracy improved to 97% in internal evaluations.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(5),
    originalWordCount: 1920,
    summaryWordCount: 60,
  },
  {
    id: "tv-3",
    sourceId: "theverge",
    title: "Samsung Galaxy S26 Ultra hands-on: The best Android camera to date",
    url: "https://www.theverge.com/",
    summaryShort: null,
    summaryDefault:
      "Samsung's flagship arrives with a 200MP variable-aperture main sensor, a periscope telephoto that achieves true optical 10x zoom, and a dedicated AI chip that processes computational photography tasks without impacting the main SoC. Low-light performance in our testing surpassed the Pixel 9 Pro.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(14),
    originalWordCount: 4200,
    summaryWordCount: 72,
  },
  {
    id: "tv-4",
    sourceId: "theverge",
    title: "The EU's AI Act enforcement begins — here's what changes today",
    url: "https://www.theverge.com/",
    summaryShort: null,
    summaryDefault:
      "The first wave of EU AI Act provisions now apply to all companies operating in member states, requiring conformity assessments for high-risk AI systems in healthcare, education, and critical infrastructure. Non-compliance penalties start at €15M or 3% of global annual turnover.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(30),
    originalWordCount: 2750,
    summaryWordCount: 59,
  },

  // Ars Technica — mix of ages
  {
    id: "at-1",
    sourceId: "arstechnica",
    title: "TSMC's 1.4nm node enters risk production with first Apple orders confirmed",
    url: "https://arstechnica.com/",
    summaryShort: null,
    summaryDefault:
      "TSMC's N1.4 process node, which uses next-generation gate-all-around transistor architecture, has entered risk production with Apple as its anchor customer for the A20 chip. Compared to N2, the new node delivers 15% speed improvement at equivalent power or 30% power reduction at the same clock speed.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(4),
    originalWordCount: 2900,
    summaryWordCount: 66,
  },
  {
    id: "at-2",
    sourceId: "arstechnica",
    title: "Scientists confirm helium-3 deposits on the Moon large enough for fusion energy",
    url: "https://arstechnica.com/",
    summaryShort: null,
    summaryDefault:
      "New orbital spectrometry data from the Artemis III mission's surface sensors reveal helium-3 concentrations in polar regolith that could sustain 400 years of current global energy consumption. The findings add economic weight to lunar colonization proposals but hinge on advances in commercial fusion reactors.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(7),
    originalWordCount: 3400,
    summaryWordCount: 64,
  },
  {
    id: "at-3",
    sourceId: "arstechnica",
    title: "Linux 6.14 kernel lands with massive AMD GPU scheduler overhaul",
    url: "https://arstechnica.com/",
    summaryShort: null,
    summaryDefault:
      "The 6.14 release includes a ground-up rewrite of AMD's GPU command submission pipeline, improving frame latency in gaming workloads by 12-18% on RDNA 3 hardware. The patch set, contributed by a team of AMD engineers over 14 months, also fixes longstanding power management bugs that caused wake-from-sleep failures.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(11),
    originalWordCount: 2100,
    summaryWordCount: 62,
  },
  {
    id: "at-4",
    sourceId: "arstechnica",
    title: "Why the JPEG-XL format is finally winning the browser war",
    url: "https://arstechnica.com/",
    summaryShort: null,
    summaryDefault:
      "After years of resistance, all major browsers now ship JPEG-XL support by default, accelerating adoption. The format's combination of lossless transcoding from legacy JPEGs, 60% smaller file sizes, and HDR support makes it compelling for web developers despite the absence of hardware decode acceleration on most devices.",
    summaryDeepDive: null,
    publishedAt: hoursAgo(20),
    originalWordCount: 2600,
    summaryWordCount: 67,
  },
];
