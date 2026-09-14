package com.rohil_verma.organization_api.Personalization;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.rohil_verma.organization_api.Articles.ArticleFeedView;
import com.rohil_verma.organization_api.Articles.ArticleRepository;
import com.rohil_verma.organization_api.UserActivity;
import com.rohil_verma.organization_api.Users.User;
import com.rohil_verma.organization_api.Users.UserActivityRepository;
import com.rohil_verma.organization_api.Users.UserRepository;
import com.rohil_verma.organization_api.Users.UserService;

/**
 * The personalization ranking engine behind {@code GET /user/feed/foryou}.
 *
 * <p>Ranks candidates over the full {@code personalization.window-hours} retention window
 * (168h / 7 days), not the 24h freshness filter the Default and Keyword views apply
 * elsewhere in the app — articles older than 24h are only reachable through this endpoint,
 * by design.
 *
 * <p>Scoring is split into small static, package-private helpers with no Spring or JPA
 * dependency where a plain value (an {@link Instant}, a {@code Map}) will do, so the
 * arithmetic can be unit tested without a Spring context. The instance method {@link #score}
 * is the only part that touches repositories; it converts JPA/projection types into the
 * plain {@link Candidate} record the static pipeline runs on.
 */
@Service
public class PersonalizationService {

    /**
     * "Shown but ignored" is approximated, not measured — there is no impressions table
     * (see {@link #approximatelySeen}). This is the minimum age before an unread article is
     * even eligible to be treated as seen, so a five-minute-old article that nobody has had
     * a real chance to notice yet is never penalised.
     */
    static final long SEEN_MIN_AGE_HOURS = 6;

    /**
     * Recency runs on its own half-life, independent of {@code personalization.half-life-days}
     * (which governs term-affinity decay). News is time-sensitive on the order of a day, not
     * three weeks, and nothing in the {@code personalization.*} spec names a separate knob for
     * it, so it is a constant here rather than a property. Promote it next to half-life-days if
     * that turns out to be the wrong call after reading the explain payload.
     */
    static final double RECENCY_HALF_LIFE_HOURS = 24.0;

    /**
     * Smooths source affinity (see {@link #sourceAffinityRawBySite}) so that one interaction
     * with a source doesn't saturate it instantly, while a source with zero interactions still
     * scores a clean zero. Classic raw/(raw+k) Bayesian-style squashing.
     */
    static final double SOURCE_AFFINITY_SMOOTHING = 3.0;

    @Autowired
    private PersonalizationProperties properties;

    @Autowired
    private ArticleRepository articleRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserScoreRepository userScoreRepository;

    @Autowired
    private UserActivityRepository userActivityRepository;

    @Autowired
    private UserService userService;

    @Autowired
    private TermExtractor termExtractor;

    public ForYouResponse score(String username) {
        Instant now = Instant.now();

        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null) {
            return new ForYouResponse(now, properties.isEnabled(), List.of());
        }

        List<String> sites = userService.getVisibleWebsitesForUser(username);
        if (sites.isEmpty()) {
            return new ForYouResponse(now, properties.isEnabled(), List.of());
        }

        Instant cutoff = now.minus(properties.getWindowHours(), ChronoUnit.HOURS);
        List<ArticleFeedView> views = articleRepository
            .findByWebsiteURLInAndProcessedAtAfterOrderByProcessedAtDesc(sites, cutoff);

        List<Candidate> candidates = new ArrayList<>();
        for (ArticleFeedView v : views) {
            if (v.getLink() == null || v.getTitle() == null) continue;
            List<String> terms = termExtractor.extract(v.getTitle(), v.getSummaryDefault(), v.getTopics());
            candidates.add(new Candidate(
                v.getLink(), v.getWebsiteURL(), v.getTitle(),
                v.getSummaryShort(), v.getSummaryDefault(), v.getSummaryLong(),
                v.getPublishedAt(), v.getProcessedAt(),
                v.getWordCount() == null ? 0 : v.getWordCount(),
                splitTopics(v.getTopics()), terms));
        }

        if (!properties.isEnabled()) {
            List<RankedCandidate> fallback = recencyFallback(candidates, properties.getFeedLimit());
            return new ForYouResponse(now, false, toArticles(fallback));
        }

        List<UserScore> scores = userScoreRepository.findByUserId(user.getId());
        Map<String, Double> profile = decayedProfile(scores, now, properties.getHalfLifeDays());

        List<UserActivity> activity = userActivityRepository.findByUser(user);
        Map<String, String> linkToSite = candidates.stream()
            .collect(Collectors.toMap(Candidate::link, Candidate::websiteURL, (a, b) -> a));
        Map<String, Double> sourceAffinity =
            sourceAffinityRawBySite(activity, linkToSite, now, properties.getHalfLifeDays());

        Set<String> keywords = normalizedKeywords(userService.listUserKeywords(username));

        Set<String> engagedLinks = activity.stream()
            .map(UserActivity::getArticleLink)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        Instant lastActivityAt = activity.stream()
            .map(UserActivity::getCreatedAt)
            .filter(Objects::nonNull)
            .max(Instant::compareTo)
            .orElse(null);

        List<ScoredCandidate> scored = new ArrayList<>();
        for (Candidate c : candidates) {
            scored.add(scoreCandidate(c, profile, sourceAffinity, keywords, engagedLinks,
                lastActivityAt, now, properties));
        }

        List<RankedCandidate> ranked = rank(scored, properties.getFeedLimit(),
            properties.getSerendipitySlots(), properties.getWeight().getDiversityPenalty());

        return new ForYouResponse(now, true, toArticles(ranked));
    }

    // ─── Pure pipeline (no Spring / JPA) ──────────────────────────────────────

    /** {@code effective = scoreVal * 2^(-ageDays / halfLifeDays)}, computed at read time. */
    static double decay(double scoreVal, Instant updatedAt, Instant now, int halfLifeDays) {
        if (updatedAt == null || halfLifeDays <= 0) return scoreVal;
        double ageDays = Duration.between(updatedAt, now).getSeconds() / 86400.0;
        if (ageDays < 0) ageDays = 0;
        return scoreVal * Math.pow(2.0, -ageDays / halfLifeDays);
    }

    static Map<String, Double> decayedProfile(List<UserScore> scores, Instant now, int halfLifeDays) {
        Map<String, Double> out = new HashMap<>();
        if (scores == null) return out;
        for (UserScore s : scores) {
            if (s.getWordKey() == null || s.getScoreVal() == null) continue;
            double effective = decay(s.getScoreVal(), s.getUpdatedAt(), now, halfLifeDays);
            out.merge(s.getWordKey(), effective, Double::sum);
        }
        return out;
    }

    /**
     * Weighted average of decayed profile scores over the candidate's extracted terms
     * (most-significant-term-first, per {@link TermExtractor}), weight {@code 1/(rank+1)}.
     * An average rather than a raw sum so an article that merely extracts more terms (longer
     * prose, more tokens under {@code MAX_TERMS}) does not win purely on term count — its
     * score is still bounded by how well the terms it does have actually match the profile.
     */
    static double termAffinityRaw(List<String> terms, Map<String, Double> profile) {
        if (terms == null || terms.isEmpty() || profile.isEmpty()) return 0.0;
        double weightedSum = 0.0;
        double weightTotal = 0.0;
        for (int i = 0; i < terms.size(); i++) {
            double w = 1.0 / (i + 1);
            weightTotal += w;
            Double effective = profile.get(terms.get(i));
            if (effective != null) {
                weightedSum += effective * w;
            }
        }
        return weightTotal == 0 ? 0.0 : weightedSum / weightTotal;
    }

    /**
     * Approximates per-source affinity from {@code user_activity} rather than a term-hit proxy:
     * each activity row is resolved to a site by matching its {@code articleLink} against the
     * candidates currently in the scoring window, and its (decayed) score is summed onto that
     * site. Activity whose article has aged out of the window (or, rarely, been swept by
     * retention before this ran) cannot be resolved to a site and is silently skipped — with a
     * 168h window and 3-day retention past that, this misses only genuinely old history.
     */
    static Map<String, Double> sourceAffinityRawBySite(List<UserActivity> activity,
            Map<String, String> linkToSite, Instant now, int halfLifeDays) {
        Map<String, Double> raw = new HashMap<>();
        if (activity == null) return raw;
        for (UserActivity a : activity) {
            if (a.getArticleLink() == null || a.getScore() == null) continue;
            String site = linkToSite.get(a.getArticleLink());
            if (site == null) continue;
            double decayed = decay(a.getScore(), a.getCreatedAt(), now, halfLifeDays);
            raw.merge(site, decayed, Double::sum);
        }
        return raw;
    }

    /** raw/(raw+k): 0 at raw=0, approaches 1 as raw grows, never overshoots. */
    static double squash(double raw, double k) {
        if (raw <= 0) return 0.0;
        return raw / (raw + k);
    }

    /** {@code 2^(-ageHours / halfLifeHours)}, in (0, 1] for any non-future timestamp. */
    static double recencyRaw(Instant processedAt, Instant now, double halfLifeHours) {
        if (processedAt == null) return 0.0;
        double ageHours = Duration.between(processedAt, now).getSeconds() / 3600.0;
        if (ageHours < 0) ageHours = 0;
        return Math.pow(2.0, -ageHours / halfLifeHours);
    }

    /**
     * Approximates "shown and scrolled past" — the one signal this app does not collect. There
     * is no impressions table, only {@code user_activity} rows for what the user actually
     * touched, so "seen" cannot be known, only guessed: an article counts as seen-and-ignored
     * when (a) the user was never recorded interacting with it, (b) it has existed long enough
     * that a normal visit would have surfaced it ({@code minAgeHours}), and (c) the user has
     * some activity timestamped after it appeared, i.e. they used the app at a time this
     * article was already in their feed. This will misclassify a user who opened the app,
     * engaged with nothing, and left — there is no way to distinguish that from "engaged with
     * nothing because none of it interested them" from write-only activity data.
     */
    static boolean approximatelySeen(Instant processedAt, Instant now, Instant lastActivityAt,
            boolean engagedWithThisArticle, long minAgeHours) {
        if (engagedWithThisArticle || processedAt == null) return false;
        long ageHours = Duration.between(processedAt, now).toHours();
        if (ageHours < minAgeHours) return false;
        return lastActivityAt != null && lastActivityAt.isAfter(processedAt);
    }

    static List<String> splitTopics(String topics) {
        if (topics == null || topics.isBlank()) return List.of();
        return Arrays.stream(topics.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .toList();
    }

    static Set<String> normalizedKeywords(List<String> keywords) {
        Set<String> out = new LinkedHashSet<>();
        if (keywords == null) return out;
        for (String kw : keywords) {
            if (kw == null) continue;
            String norm = TermExtractorImpl.normalizeKey(kw);
            if (!norm.isEmpty()) out.add(norm);
        }
        return out;
    }

    /**
     * Fraction of the user's explicit keywords that this candidate matches, either against its
     * extracted term set (the common case — same normalization on both sides, see
     * {@link TermExtractorImpl#normalizeKey}) or, as a recall fallback, as a raw case-insensitive
     * substring of the title/summary for keywords the extractor didn't surface as one of its
     * top {@code MAX_TERMS} terms.
     */
    static double keywordMatchFraction(List<String> terms, String title, String summary,
            Set<String> normalizedKeywords) {
        if (normalizedKeywords == null || normalizedKeywords.isEmpty()) return 0.0;
        Set<String> termSet = terms == null ? Set.of() : new HashSet<>(terms);
        String haystack = ((title == null ? "" : title) + " " + (summary == null ? "" : summary))
            .toLowerCase(java.util.Locale.ROOT);
        int matched = 0;
        for (String kw : normalizedKeywords) {
            if (termSet.contains(kw) || haystack.contains(kw)) {
                matched++;
            }
        }
        return (double) matched / normalizedKeywords.size();
    }

    static ScoredCandidate scoreCandidate(Candidate c, Map<String, Double> profile,
            Map<String, Double> sourceAffinityRawBySite, Set<String> keywords,
            Set<String> engagedLinks, Instant lastActivityAt, Instant now,
            PersonalizationProperties props) {
        PersonalizationProperties.Weight w = props.getWeight();

        double termAffinity = termAffinityRaw(c.terms(), profile) * w.getTermAffinity();

        double sourceRaw = sourceAffinityRawBySite.getOrDefault(c.websiteURL(), 0.0);
        double sourceAffinity = squash(sourceRaw, SOURCE_AFFINITY_SMOOTHING) * w.getSourceAffinity();

        double kwFraction = keywordMatchFraction(c.terms(), c.title(), c.summaryDefault(), keywords);
        double keywordBoost = kwFraction * w.getKeywordBoost();

        double recency = recencyRaw(c.processedAt(), now, RECENCY_HALF_LIFE_HOURS) * w.getRecency();

        boolean engaged = engagedLinks.contains(c.link());
        boolean seen = approximatelySeen(c.processedAt(), now, lastActivityAt, engaged, SEEN_MIN_AGE_HOURS);
        double seenPenalty = seen ? -w.getSeenPenalty() : 0.0;

        double baseScore = termAffinity + sourceAffinity + keywordBoost + recency + seenPenalty;
        boolean lowAffinity = termAffinity == 0.0 && sourceAffinity == 0.0 && keywordBoost == 0.0;
        String topTerm = (c.terms() == null || c.terms().isEmpty()) ? null : c.terms().get(0);
        List<String> topTerms = c.terms() == null ? List.of()
            : c.terms().subList(0, Math.min(5, c.terms().size()));

        return new ScoredCandidate(c, baseScore, termAffinity, sourceAffinity, keywordBoost,
            recency, seenPenalty, topTerm, topTerms, lowAffinity);
    }

    /**
     * Greedy re-rank, run AFTER scoring rather than folded into it. Two passes:
     *
     * <ol>
     *   <li>Fill {@code feedLimit - serendipitySlots} positions by repeatedly picking the
     *       remaining candidate with the highest score-minus-diversity-penalty, where the
     *       penalty is {@code (occurrences of this candidate's top term already placed) *
     *       diversityPenalty}. The first article on a topic is never penalised; the second
     *       sharing that same top term is penalised once, the third twice, and so on — so one
     *       story cannot take the whole top of the feed, and because the adjusted score is
     *       recomputed at every step (not sorted once), a heavily-penalised repeat can be
     *       overtaken by a lower-raw-score but more diverse article.
     *   <li>Reserve the trailing {@code serendipitySlots} positions for high-recency,
     *       low-affinity candidates the first pass did not already select (falling back to
     *       whatever is left, by recency, if too few low-affinity candidates remain) — so the
     *       feed always surfaces something outside the profile's existing evidence.
     * </ol>
     */
    static List<RankedCandidate> rank(List<ScoredCandidate> scored, int feedLimit,
            int serendipitySlots, double diversityWeight) {
        List<ScoredCandidate> sorted = new ArrayList<>(scored);
        sorted.sort(Comparator.comparingDouble(ScoredCandidate::baseScore).reversed());

        int total = Math.min(Math.max(0, feedLimit), sorted.size());
        int reservedForSerendipity = Math.max(0, serendipitySlots);
        int normalSlots = Math.max(0, total - reservedForSerendipity);

        List<ScoredCandidate> remaining = new ArrayList<>(sorted);
        List<RankedCandidate> output = new ArrayList<>();
        Map<String, Integer> topTermPlacedCount = new HashMap<>();

        while (!remaining.isEmpty() && output.size() < normalSlots) {
            ScoredCandidate best = null;
            double bestAdjusted = Double.NEGATIVE_INFINITY;
            int bestPrior = 0;
            for (ScoredCandidate sc : remaining) {
                int prior = sc.topTerm() == null ? 0 : topTermPlacedCount.getOrDefault(sc.topTerm(), 0);
                double adjusted = sc.baseScore() - prior * diversityWeight;
                if (adjusted > bestAdjusted) {
                    bestAdjusted = adjusted;
                    best = sc;
                    bestPrior = prior;
                }
            }
            double diversityPenalty = -(bestPrior * diversityWeight);
            output.add(toRanked(best, diversityPenalty, false));
            remaining.remove(best);
            if (best.topTerm() != null) {
                topTermPlacedCount.merge(best.topTerm(), 1, Integer::sum);
            }
        }

        int slotsToFill = Math.min(reservedForSerendipity, Math.max(0, total - output.size()));
        if (slotsToFill > 0) {
            List<ScoredCandidate> lowAffinityPool = remaining.stream()
                .filter(ScoredCandidate::lowAffinity)
                .sorted(Comparator.comparingDouble(ScoredCandidate::recency).reversed())
                .collect(Collectors.toCollection(ArrayList::new));
            List<ScoredCandidate> fallbackPool = remaining.stream()
                .filter(sc -> !sc.lowAffinity())
                .sorted(Comparator.comparingDouble(ScoredCandidate::recency).reversed())
                .collect(Collectors.toCollection(ArrayList::new));

            List<ScoredCandidate> picks = new ArrayList<>();
            for (ScoredCandidate sc : lowAffinityPool) {
                if (picks.size() >= slotsToFill) break;
                picks.add(sc);
            }
            for (ScoredCandidate sc : fallbackPool) {
                if (picks.size() >= slotsToFill) break;
                picks.add(sc);
            }
            for (ScoredCandidate sc : picks) {
                output.add(toRanked(sc, 0.0, true));
            }
        }

        return output;
    }

    private static RankedCandidate toRanked(ScoredCandidate sc, double diversityPenalty, boolean serendipity) {
        ScoreExplain explain = new ScoreExplain(sc.termAffinity(), sc.sourceAffinity(), sc.keywordBoost(),
            sc.recency(), diversityPenalty, sc.seenPenalty(), serendipity, sc.topTerms());
        return new RankedCandidate(sc.candidate(), explain, explain.total());
    }

    /** {@code personalization.enabled=false}: plain recency order, same response shape. */
    static List<RankedCandidate> recencyFallback(List<Candidate> candidates, int feedLimit) {
        return candidates.stream()
            .sorted(Comparator.comparing(Candidate::processedAt,
                Comparator.nullsLast(Comparator.naturalOrder())).reversed())
            .limit(Math.max(0, feedLimit))
            .map(c -> {
                List<String> topTerms = c.terms() == null ? List.of()
                    : c.terms().subList(0, Math.min(5, c.terms().size()));
                ScoreExplain explain = new ScoreExplain(0, 0, 0, 0, 0, 0, false, topTerms);
                return new RankedCandidate(c, explain, explain.total());
            })
            .toList();
    }

    private static List<ForYouArticle> toArticles(List<RankedCandidate> ranked) {
        return ranked.stream().map(rc -> {
            Candidate c = rc.candidate();
            return new ForYouArticle(
                c.link(), c.websiteURL(), c.title(),
                nullToEmpty(c.summaryShort()), nullToEmpty(c.summaryDefault()), nullToEmpty(c.summaryLong()),
                c.publishedAt(), c.processedAt(), c.wordCount(), c.topics(),
                rc.score(), rc.explain());
        }).toList();
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    // ─── Plain value types the static pipeline runs on ────────────────────────

    record Candidate(String link, String websiteURL, String title, String summaryShort,
                      String summaryDefault, String summaryLong, String publishedAt,
                      Instant processedAt, int wordCount, List<String> topics, List<String> terms) {
    }

    record ScoredCandidate(Candidate candidate, double baseScore, double termAffinity,
                            double sourceAffinity, double keywordBoost, double recency,
                            double seenPenalty, String topTerm, List<String> topTerms,
                            boolean lowAffinity) {
    }

    record RankedCandidate(Candidate candidate, ScoreExplain explain, double score) {
    }
}
