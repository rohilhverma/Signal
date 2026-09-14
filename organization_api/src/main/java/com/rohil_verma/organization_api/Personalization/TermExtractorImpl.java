package com.rohil_verma.organization_api.Personalization;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Java port of {@code frontend/components/signal/hot-topics/computeHotTopics.ts}, plus the
 * preferred path that file cannot take: {@code articles.topics}.
 *
 * <p>Two paths, one vocabulary. When the summarizer tagged the article, those tags <em>are</em>
 * the terms — they are real entities rather than words that happened to repeat. When it did not
 * (everything scraped before tagging shipped), the tokenizer heuristics stand in. Both paths run
 * their output through {@link #normalizeKey}, so a profile built from tags still matches a
 * candidate scored from prose.
 *
 * <p><b>Divergences from the TypeScript, both deliberate:</b>
 * <ul>
 *   <li>No {@code MIN_SOURCES} filter. That exists to answer "what is trending across the feed";
 *       here the question is "what is this one article about", where a cross-source floor would
 *       reject everything.
 *   <li>No unigram-under-phrase suppression. In the bubble field, showing "Artificial",
 *       "Intelligence" and "Artificial Intelligence" as three circles is incoherent. In a term
 *       vocabulary it is recall: an article that says only "Nvidia" must still match a profile
 *       built from "Nvidia GPU". The phrase still outranks its parts via {@link #heatScore}.
 * </ul>
 */
@Component
public class TermExtractorImpl implements TermExtractor {

    /** Terms kept per article. Past this the tail is noise weighted near zero anyway. */
    private static final int MAX_TERMS = 12;

    /**
     * Allows digits and internal punctuation so "GPT-4" and "Web3" survive, and allows
     * two-character tokens so "AI" does.
     *
     * <p>Ported verbatim, including a known limit: "5G" does <em>not</em> match, because the
     * pattern requires a letter at a word boundary and there is no boundary between "5" and "G".
     * The TS comment claims otherwise. Left as-is on purpose — this side and the frontend must
     * tokenize identically, and "faithful" beats "better" when two implementations have to agree.
     */
    private static final Pattern TOKEN_RE =
        Pattern.compile("\\b[A-Za-z][A-Za-z0-9]*(?:[.+-][A-Za-z0-9]+)*\\b");

    /**
     * Two-letter words only earn a place if they are an acronym — "AI" yes, "we" no.
     * Widening the tokenizer let these in, so they get filtered on the way back out.
     */
    private static final Set<String> SHORT_TOKEN_NOISE = Set.of(
        "us", "we", "he", "it", "as", "at", "by", "do", "go", "if", "in", "is", "of",
        "on", "or", "so", "to", "up", "no", "my", "me", "an", "be");

    /**
     * Ordinary English function words plus domain-generic nouns ("company", "technology",
     * "platform") that appear in almost every tech article and would otherwise win on frequency
     * alone while saying nothing. Ported from {@code hot-topics/stopwords.ts}.
     */
    private static final Set<String> HOT_TOPICS_STOPWORDS = setOf(
        "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
        "from","is","are","was","were","be","been","being","have","has","had","do",
        "does","did","will","would","could","should","may","might","can","its","it",
        "this","that","these","those","as","up","out","so","if","not","no","nor",
        "yet","both","either","neither","each","few","more","most","other","some",
        "such","than","too","very","just","how","when","where","who","which","what",
        "why","all","any","after","about","into","through","during","before","while",
        "their","there","they","them","then","say","says","said","also","now","over",
        "under","between","our","we","us","he","she","his","her","him","my","your",
        "one","two","first","last","next","like","get","make","take","use","see",
        "know","come","go","want","look","think","give","back","still","well","way",
        "even","much","need","set","put","end","week","year","day","time","per","via",
        "company","companies","technology","tech","system","systems","product","products",
        "service","services","business","businesses","market","markets","user","users",
        "app","apps","platform","platforms","team","teams","work","using","based","made",
        "called","including","percent","million","billion","people","thing","things",
        "part","long","high","low","large","small","big","old","report","reports",
        "according","following","despite","amid","since","though","although","however",
        "because","within","without","around","among","against","data","number","numbers");

    /**
     * Second tier: ordinary English that is not a function word but is never a topic — generic
     * verbs, adjectives and adverbs. Kept separate so the first list stays auditable.
     */
    private static final Set<String> GENERIC_ENGLISH = setOf(
        "able","about","above","across","actually","add","added","adding","address",
        "allowing","content","development","digital","ecosystem","insights","launch",
        "new","physical","virtual",
        "aim","aims","allow","allowed","allows","almost","already","also","always",
        "another","answer","anyone","appear","appears","approach","area","areas","ask",
        "asked","available","away","back","bad","based","become","becomes","begin",
        "believe","below","best","better","beyond","biggest","bring","brings","build",
        "building","built","call","calls","came","case","cases","cause","certain",
        "change","changed","changes","choice","claim","claims","clear","clearly","close",
        "come","comes","coming","common","complete","continue","cost","costs","create",
        "created","creating","current","currently","cut","day","days","deal","decide",
        "described","despite","detail","details","different","difficult","direct",
        "due","early","easier","easy","effort","either","end","enough","entire",
        "especially","even","event","events","every","exactly","example","expect",
        "expected","experience","fact","far","fast","featuring","feature","features",
        "feel","few","final","find","finds","first","focus","follow","form","found",
        "full","further","future","gave","general","get","gets","getting","give",
        "given","gives","goes","going","good","got","great","group","grow","growing",
        "half","hand","happen","hard","help","helps","hold","home","hope","hour",
        "hours","huge","idea","ideas","important","include","includes","increase",
        "inside","instead","issue","issues","job","jobs","keep","kind","know","known",
        "large","larger","last","late","later","lead","least","leave","left","less",
        "let","level","life","like","likely","limited","line","little","live","local",
        "look","looking","lot","made","main","major","make","makes","making","many",
        "matter","mean","means","meant","might","month","months","more","most","move",
        "moving","much","must","name","near","nearly","need","needs","never","next",
        "night","note","noted","now","offer","offers","often","one","only","open",
        "order","original","other","others","overall","own","particular","past","per",
        "perhaps","place","plan","plans","point","possible","potential","present",
        "previous","probably","problem","problems","process","provide","provides",
        "public","put","question","questions","quickly","quite","raise","range",
        "rather","reach","read","ready","real","really","reason","recent","recently",
        "remain","result","results","return","right","rise","risk","risks","role",
        "run","running","said","same","saw","say","saying","says","second","see",
        "seem","seems","seen","sense","series","set","several","share","short",
        "show","shows","side","significant","similar","simple","simply","single",
        "site","situation","size","slow","someone","something","soon","sort","specific",
        "spend","start","started","starting","state","stay","step","still","stop",
        "story","strong","suggest","support","sure","take","taken","takes","taking",
        "talk","tell","term","terms","test","third","three","time","times","today",
        "together","told","took","top","total","toward","try","turn","two","type",
        "under","understand","until","use","used","uses","using","usually","value",
        "various","version","very","view","want","wants","way","ways","week","weeks",
        "well","went","whether","whole","why","wide","work","working","works","world",
        "worth","year","years","yet");

    private static Set<String> setOf(String... words) {
        return Set.copyOf(new HashSet<>(Arrays.asList(words)));
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    @Override
    public List<String> extract(String title, String summary, String topics) {
        List<String> tagged = fromTopics(topics);
        if (!tagged.isEmpty()) {
            return tagged;
        }
        return fromProse(title, summary);
    }

    // ─── Preferred path: summarizer tags ─────────────────────────────────────

    /**
     * Tags arrive comma-joined and already ordered by the model's sense of significance, so the
     * order is kept rather than re-ranked. Anything that normalises to nothing (punctuation-only,
     * a bare number) is dropped.
     *
     * <p>Stopwords are deliberately <em>not</em> applied here. A tag is a curated entity, and
     * filtering inside a multi-word tag would silently rewrite it — "Data privacy" would become
     * "privacy", a different key from the one the same tag produces elsewhere.
     */
    private List<String> fromTopics(String topics) {
        if (topics == null || topics.isBlank()) {
            return List.of();
        }
        Set<String> keys = new LinkedHashSet<>();
        for (String raw : topics.split(",")) {
            String key = normalizeKey(raw);
            if (!key.isEmpty()) {
                keys.add(key);
            }
        }
        return new ArrayList<>(keys).subList(0, Math.min(keys.size(), MAX_TERMS));
    }

    // ─── Fallback path: tokenized prose ──────────────────────────────────────

    private List<String> fromProse(String title, String summary) {
        Map<String, Candidate> index = new LinkedHashMap<>();

        // Titles are Title Case, so every word in one looks like a proper noun. Capitalisation
        // evidence is therefore collected from the summary only, while both contribute mentions.
        scanInto(index, title == null ? "" : title, false);
        scanInto(index, summary == null ? "" : summary, true);

        if (index.isEmpty()) {
            return List.of();
        }

        List<Map.Entry<String, Candidate>> ranked = new ArrayList<>(index.entrySet());
        ranked.sort(Comparator.comparingDouble(
            (Map.Entry<String, Candidate> e) -> heatScore(e.getValue())).reversed());

        List<String> out = new ArrayList<>();
        for (Map.Entry<String, Candidate> entry : ranked) {
            if (out.size() >= MAX_TERMS) break;
            out.add(entry.getKey());
        }
        return out;
    }

    private void scanInto(Map<String, Candidate> index, String text, boolean isProse) {
        List<Token> tokens = tokenize(text);
        for (int i = 0; i < tokens.size(); i++) {
            Token token = tokens.get(i);
            if (!isUsableToken(token.text)) continue;

            // A capital after "." or at position 0 is grammar, not evidence, so it never
            // reaches capRatio.
            boolean informative = isProse && !token.sentenceStart;
            boolean capitalized = informative && isCapitalized(token.text);

            String key = singularize(token.text.toLowerCase(Locale.ROOT));
            note(index, key, false, informative, capitalized);

            // A capitalised pair is the cheap proxy for a named entity: "Artificial
            // Intelligence", "Supreme Court". Requiring both halves to be capitalised keeps
            // this from generating a bigram for every adjacent word pair.
            Token next = i + 1 < tokens.size() ? tokens.get(i + 1) : null;
            if (next != null
                && isUsableToken(next.text)
                && isCapitalized(token.text)
                && isCapitalized(next.text)
                && !isAcronym(token.text)) {
                String nextKey = singularize(next.text.toLowerCase(Locale.ROOT));
                note(index, key + " " + nextKey, true, informative, capitalized);
            }
        }
    }

    private static void note(Map<String, Candidate> index, String key, boolean isPhrase,
                             boolean proseSeen, boolean proseCapped) {
        Candidate entry = index.computeIfAbsent(key, k -> new Candidate(isPhrase));
        entry.totalMentions++;
        if (proseSeen) {
            entry.proseSeen++;
            if (proseCapped) entry.proseCapped++;
        }
    }

    /**
     * How "hot" a term is. Raw frequency alone ranks common English above real subjects, so
     * capitalisation in running prose stands in for "proper noun" and a phrase is worth more
     * than either of its halves.
     */
    private static double heatScore(Candidate entry) {
        double capRatio = entry.proseSeen == 0 ? 0 : (double) entry.proseCapped / entry.proseSeen;
        return entry.totalMentions * (1 + 2 * capRatio) * (entry.isPhrase ? 1.35 : 1);
    }

    // ─── Shared normalisation — the reason both paths interoperate ───────────

    /**
     * The single key function. Tokenizes, lowercases and singularizes each word, rejoining with
     * single spaces. Applied to summarizer tags and, word by word, to tokenized prose, so
     * "AI Chips" the tag and "AI Chips" the phrase both land on {@code "ai chip"}.
     */
    static String normalizeKey(String raw) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder();
        Matcher m = TOKEN_RE.matcher(raw);
        while (m.find()) {
            String word = singularize(m.group().toLowerCase(Locale.ROOT));
            if (word.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(word);
        }
        return sb.toString();
    }

    /**
     * Collapses regular plurals onto their singular so "chips" and "chip" are one term.
     * Deliberately crude — a real stemmer would also fold "running"/"ran", which on
     * proper-noun-heavy news text produces more wrong merges than right ones. Short keys are
     * left alone so "AIS" is never read as a plural of "AI".
     */
    static String singularize(String key) {
        if (key.length() <= 3) return key;
        if (key.endsWith("ss") || key.endsWith("us") || key.endsWith("is")) return key;
        if (key.endsWith("ies")) return key.substring(0, key.length() - 3) + "y";
        if (key.endsWith("ches") || key.endsWith("shes") || key.endsWith("xes")) {
            return key.substring(0, key.length() - 2);
        }
        if (key.endsWith("s")) return key.substring(0, key.length() - 1);
        return key;
    }

    static boolean isCapitalized(String token) {
        return !token.isEmpty() && Character.isUpperCase(token.charAt(0));
    }

    static boolean isAcronym(String token) {
        return token.length() <= 4
            && token.equals(token.toUpperCase(Locale.ROOT))
            && token.chars().anyMatch(c -> c >= 'A' && c <= 'Z');
    }

    static boolean isUsableToken(String token) {
        String lower = token.toLowerCase(Locale.ROOT);
        if (HOT_TOPICS_STOPWORDS.contains(lower)) return false;
        if (GENERIC_ENGLISH.contains(lower)) return false;
        if (token.length() < 2) return false;
        if (token.length() == 2 && !isAcronym(token)) return false;
        if (SHORT_TOKEN_NOISE.contains(lower)) return false;
        // Lowercase past participles are verbs, not subjects: "introduced", "announced",
        // "expected". The length floor protects real nouns that merely end in -ed ("speed",
        // "feed", "breed"), and the lowercase test spares proper nouns.
        if (token.equals(lower) && lower.length() >= 6 && lower.endsWith("ed")) return false;
        return true;
    }

    /** Tokenizes, recording for each token whether it sits at a sentence start. */
    static List<Token> tokenize(String text) {
        List<Token> found = new ArrayList<>();
        if (text == null || text.isEmpty()) return found;
        Matcher m = TOKEN_RE.matcher(text);
        while (m.find()) {
            String before = stripTrailing(text.substring(0, m.start()));
            char prev = before.isEmpty() ? '\0' : before.charAt(before.length() - 1);
            boolean sentenceStart = before.isEmpty() || prev == '.' || prev == '!' || prev == '?';
            found.add(new Token(m.group(), sentenceStart));
        }
        return found;
    }

    private static String stripTrailing(String s) {
        int end = s.length();
        while (end > 0 && Character.isWhitespace(s.charAt(end - 1))) end--;
        return s.substring(0, end);
    }

    record Token(String text, boolean sentenceStart) {}

    private static final class Candidate {
        final boolean isPhrase;
        int totalMentions;
        /** Occurrences in summary prose — the denominator for capRatio. */
        int proseSeen;
        /** Of those, how many were capitalised away from a sentence start. */
        int proseCapped;

        Candidate(boolean isPhrase) {
            this.isPhrase = isPhrase;
        }
    }
}
