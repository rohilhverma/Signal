// ─── Hot Topics · extraction ──────────────────────────────────────────────────
//
// Turns a set of articles into the terms trending across them. Pure: no React, no
// DOM, no network. The corpus is `title + summaryDefault`, which is what is
// reliably populated - summaryShort and summaryDeepDive are null until a user asks
// for that mode, so reading them here would silently do nothing.
//
// Candidate terms come from `compromise`, an open-source NLP library, rather than a
// hand-rolled tokenizer. The previous version classified terms by regex heuristics -
// capitalization, a suffix-based verb filter, a ~150-word stopword list - and still
// let verbs ("follows"), and generic nouns ("chain", "city", "prices") through,
// because none of those heuristics actually know what a word IS grammatically.
// compromise does real part-of-speech tagging and named-entity recognition, so
// candidates are restricted to what it identifies as a person, organization, or
// place, plus a small regex catch for short acronyms ("AI", "LLM") that a lite NER
// model doesn't always classify with confidence. This is a strictly narrower net
// than "every noun" on purpose: a trending-topics field reads as a list of subjects
// (Nvidia, Grand Theft Auto, Jason Duval), not a list of vocabulary (access, feature,
// move) - see references/nlp-prototype-results.md in this session's history for the
// before/after against real article text that motivated the swap.

import nlp from "compromise";

import type { Article, Source } from "../data/mockArticles";
import type { HotTopic } from "./types";

/** Terms appearing in fewer than this many distinct sources are not "trending". */
const MIN_SOURCES = 2;
const MAX_TOPICS = 18;

/**
 * Acronyms compromise's lite NER model doesn't reliably tag as an organization on
 * its own ("AI", "LLM", "EV", "GTA"). Plain regex: 2-5 consecutive capital letters.
 * The noise list is short because it only has to catch the few all-caps words that
 * are common English rather than an acronym - the entity extraction above is what
 * does the real filtering, this is a narrow supplement to it, not a second stopword
 * list.
 */
const ACRONYM_RE = /\b[A-Z]{2,5}\b/g;
const ACRONYM_NOISE = new Set(["THE", "AND", "FOR", "ITS", "NEW", "ALL", "ARE", "WAS", "BUT", "NOT"]);

function isCapitalized(word: string): boolean {
  return word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
}

/**
 * "U.S." and "US" are the same topic wearing two different spellings. compromise's
 * place tagger returns dotted abbreviations ("U.S.", "U.K.") as their own entity,
 * while the plain acronym regex below catches the undotted form elsewhere in the
 * same corpus - without this they hash to different keys ("u.s" vs "us") and the
 * field shows both as separate bubbles. Matches the classic single-capital-letter-
 * plus-period shape (U.S., U.K., U.S.A.) and strips the dots so both spellings
 * collapse to one key. Deliberately narrow: multi-word phrases and ordinary
 * capitalized words never match this shape, so this cannot misfire on anything else
 * that reaches it.
 */
function collapseAbbreviationDots(term: string): string {
  return /^[A-Z](\.[A-Z])+\.?$/.test(term) ? term.replace(/\./g, "") : term;
}

/**
 * Strips what NER leaves stuck to a span at a sentence boundary: a possessive
 * ("Google's" / "Google’s" -> "Google", both apostrophe styles - Gemini-authored
 * summaries use whichever their source text used) and any leading/trailing
 * punctuation ("Microsoft," at a clause end, "(Nvidia)" inside parens).
 */
function cleanTerm(raw: string): string {
  return collapseAbbreviationDots(raw.trim())
    .replace(/['’]s$/i, "")
    .replace(/^[^\w]+|[^\w]+$/g, "")
    .trim();
}

/**
 * compromise's organization/place tagger occasionally fires on an ordinary lowercase
 * word ("preview", "move") that happens to sit where an entity could grammatically
 * go. A real entity is capitalized in the source text - always for a name, and by
 * convention for an acronym - so a single-word candidate that ISN'T fails this check
 * and is dropped. Multi-word spans ("grand theft auto") are exempt: compromise
 * rarely misfires on a full phrase the way it does on a single word, and requiring
 * every word capitalized would wrongly reject a mid-sentence multi-word name whose
 * lowercase words are genuine parts of it.
 */
function looksLikeRealEntity(term: string): boolean {
  if (term.includes(" ")) return true;
  return isCapitalized(term) || term === term.toUpperCase();
}

function extractCandidates(text: string): string[] {
  const doc = nlp(text);
  const entities = [...doc.people().out("array"), ...doc.organizations().out("array"), ...doc.places().out("array")];
  const acronyms = [...text.matchAll(ACRONYM_RE)].map(m => m[0]).filter(a => !ACRONYM_NOISE.has(a));

  const cleaned = new Set<string>();
  for (const raw of [...entities, ...acronyms]) {
    const term = cleanTerm(raw);
    if (term.length < 2) continue;
    if (!looksLikeRealEntity(term)) continue;
    cleaned.add(term);
  }
  return Array.from(cleaned);
}

type Candidate = {
  /** Surface form -> times seen. The most frequent form wins, so "OpenAI" beats a
   *  one-off "Openai" from a source with worse capitalization. */
  forms: Map<string, number>;
  sourceArticles: Map<string, Set<string>>;
  articleIndex: Map<string, Article>;
  totalMentions: number;
};

function bestForm(forms: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [form, count] of forms) {
    if (count > bestCount) {
      bestCount = count;
      best = form;
    }
  }
  return best;
}

export function computeHotTopics(articles: Article[], sources: Source[]): HotTopic[] {
  const sourceOrder = new Map(sources.map((s, i) => [s.id, i]));
  const index = new Map<string, Candidate>();

  for (const article of articles) {
    const text = `${article.title ?? ""}. ${article.summaryDefault ?? ""}`;

    for (const term of extractCandidates(text)) {
      const key = term.toLowerCase();
      let entry = index.get(key);
      if (!entry) {
        entry = { forms: new Map(), sourceArticles: new Map(), articleIndex: new Map(), totalMentions: 0 };
        index.set(key, entry);
      }
      entry.forms.set(term, (entry.forms.get(term) ?? 0) + 1);
      entry.totalMentions += 1;
      entry.articleIndex.set(article.id, article);
      const seen = entry.sourceArticles.get(article.sourceId);
      if (seen) seen.add(article.id);
      else entry.sourceArticles.set(article.sourceId, new Set([article.id]));
    }
  }

  return Array.from(index.values())
    .filter(entry => entry.sourceArticles.size >= MIN_SOURCES)
    .map(entry => {
      const sourceIds = Array.from(entry.sourceArticles.keys()).sort(
        (a, b) => (sourceOrder.get(a) ?? 999) - (sourceOrder.get(b) ?? 999),
      );
      const articlesBySource = new Map<string, Article[]>();
      for (const [srcId, ids] of entry.sourceArticles) {
        articlesBySource.set(
          srcId,
          Array.from(ids)
            .map(id => entry.articleIndex.get(id)!)
            .filter(Boolean),
        );
      }
      return {
        term: bestForm(entry.forms),
        sourceIds,
        totalMentions: entry.totalMentions,
        articlesBySource,
      };
    })
    .sort((a, b) =>
      b.sourceIds.length !== a.sourceIds.length
        ? b.sourceIds.length - a.sourceIds.length
        : b.totalMentions - a.totalMentions,
    )
    .slice(0, MAX_TOPICS);
}
