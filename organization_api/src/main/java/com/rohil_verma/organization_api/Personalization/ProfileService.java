package com.rohil_verma.organization_api.Personalization;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.rohil_verma.organization_api.Articles.Article;
import com.rohil_verma.organization_api.Articles.ArticleRepository;

/**
 * Distills raw interaction activity into the per-user term profile in {@code user_scores},
 * at interaction time — while the article the activity refers to still exists.
 *
 * <p>{@code ArticleRetention} deletes articles after 7 days; {@code user_activity} is kept
 * indefinitely. Only a small fraction of current activity rows still join to {@code articles}
 * on link, which means the profile cannot be built lazily from history later — by the time
 * a read wants it, the article text and topics behind most of that history are already
 * gone. So this runs synchronously with the activity write instead, off the article row
 * while it is still there to read.
 *
 * <p>Writes raw accumulated deltas only. Half-life decay is a read-time concern, applied
 * elsewhere from {@link UserScore#getUpdatedAt()} — this class never ages or rewrites an
 * existing score, only adds to it.
 */
@Service
public class ProfileService {

    private static final Logger log = LoggerFactory.getLogger(ProfileService.class);

    /**
     * Per-term weight decays with the term's rank in the extractor's most-significant-first
     * output: the article's lead term gets full credit for the interaction, each term after
     * it a little less, floored so the tail never rounds all the way to zero and drops out
     * silently.
     */
    static final double RANK_DECAY = 0.75;
    static final double MIN_TERM_WEIGHT = 0.1;

    @Autowired
    private ArticleRepository articleRepository;

    @Autowired
    private TermExtractor termExtractor;

    @Autowired
    private UserScoreRepository userScoreRepository;

    /**
     * Only {@link PersonalizationProperties#getHalfLifeDays()} is needed, and only by
     * {@link #topTopics}. Left null by the unit tests, which wire collaborators by reflection;
     * {@link #halfLifeDays()} treats that as "no decay" rather than throwing.
     */
    @Autowired(required = false)
    private PersonalizationProperties properties;

    /**
     * @param userId   whose profile to update
     * @param activity articleLink -> cumulative interaction score, as sent by the client
     *                 in one flush. Entries for articles no longer in {@code articles} are
     *                 skipped quietly; everything else contributes to the profile.
     */
    public void applyActivity(Integer userId, Map<String, Integer> activity) {
        if (userId == null || activity == null) return;
        activity.forEach((link, score) -> applyOne(userId, link, score));
    }

    private void applyOne(Integer userId, String link, Integer score) {
        if (link == null || score == null || score <= 0) {
            return;
        }

        Optional<Article> found = articleRepository.findFirstByLink(link);
        if (found.isEmpty()) {
            log.debug("profile: skipping activity for {}, article no longer exists", link);
            return;
        }

        Article article = found.get();
        List<String> terms = termExtractor.extract(
            article.getTitle(), article.getSummaryDefault(), article.getTopics());
        if (terms.isEmpty()) {
            log.debug("profile: no terms extracted for {}", link);
            return;
        }

        Map<String, String> labels = displayLabels(article.getTopics());

        for (int rank = 0; rank < terms.size(); rank++) {
            double weight = Math.max(MIN_TERM_WEIGHT, Math.pow(RANK_DECAY, rank));
            int delta = (int) Math.round(score * weight);
            if (delta <= 0) {
                continue;
            }
            String term = terms.get(rank);
            userScoreRepository.upsertScoreDelta(userId, term, delta, labels.get(term));
        }
    }

    /**
     * Normalised key -> the raw tag it came from, so the profile can keep a human-readable
     * form of each term alongside the key it matches on.
     *
     * <p>Derived here rather than in {@link TermExtractor} because the article is already in
     * hand and the extractor's contract — normalised keys, most significant first — is worth
     * leaving alone. Terms that came from the prose fallback simply miss this map and store a
     * null label.
     */
    static Map<String, String> displayLabels(String topics) {
        Map<String, String> labels = new LinkedHashMap<>();
        if (topics == null || topics.isBlank()) {
            return labels;
        }
        for (String raw : topics.split(",")) {
            String trimmed = raw.trim();
            if (trimmed.isEmpty()) continue;
            String key = TermExtractorImpl.normalizeKey(trimmed);
            // putIfAbsent: two tags normalising to the same key keep the first, matching
            // the extractor's own LinkedHashSet dedupe order.
            if (!key.isEmpty()) labels.putIfAbsent(key, trimmed);
        }
        return labels;
    }

    // ─── Read side ────────────────────────────────────────────────────────────

    /**
     * One entry of the user's "what I actually read" ranking.
     *
     * @param weight       decayed affinity, for relative sizing only — not meaningful on its own
     * @param articleCount how many articles fed this term, which is the figure worth showing
     */
    public record TopicAffinity(String label, double weight, int articleCount) {}

    /**
     * The user's strongest topics, most significant first.
     *
     * <p>Ranked on the same half-life-decayed affinity the For You feed scores against, so the
     * two cannot disagree about what this user is into. Reading the profile directly rather
     * than joining {@code user_activity} back to {@code articles} is what makes this complete:
     * that join loses every article retention has already swept.
     */
    public List<TopicAffinity> topTopics(Integer userId, int limit) {
        if (userId == null || limit <= 0) {
            return List.of();
        }

        Instant now = Instant.now();
        int halfLifeDays = halfLifeDays();

        List<TopicAffinity> ranked = new ArrayList<>();
        for (UserScore score : userScoreRepository.findByUserId(userId)) {
            if (score.getWordKey() == null || score.getScoreVal() == null) continue;
            double weight = PersonalizationService.decay(
                score.getScoreVal(), score.getUpdatedAt(), now, halfLifeDays);
            if (weight <= 0) continue;
            ranked.add(new TopicAffinity(
                label(score),
                weight,
                score.getHitCount() == null ? 0 : score.getHitCount()));
        }

        ranked.sort(Comparator.comparingDouble(TopicAffinity::weight).reversed());
        return ranked.size() > limit ? List.copyOf(ranked.subList(0, limit)) : List.copyOf(ranked);
    }

    private int halfLifeDays() {
        // Null properties (unit tests) or a non-positive half-life both mean "don't decay",
        // which PersonalizationService.decay already handles by returning the score as-is.
        return properties == null ? 0 : properties.getHalfLifeDays();
    }

    private static String label(UserScore score) {
        String stored = score.getDisplayLabel();
        return stored != null && !stored.isBlank() ? stored : titleCase(score.getWordKey());
    }

    /**
     * Last-resort presentation for a term with no stored label — rows written before
     * {@code display_label} existed, and anything from the prose tokenizer. Imperfect by
     * nature ("openai" becomes "Openai"), which is exactly why the raw tag is stored when
     * there is one.
     */
    static String titleCase(String key) {
        if (key == null || key.isBlank()) return "";
        StringBuilder out = new StringBuilder(key.length());
        for (String word : key.trim().split("\\s+")) {
            if (word.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(Character.toUpperCase(word.charAt(0)))
               .append(word.substring(1).toLowerCase(Locale.ROOT));
        }
        return out.toString();
    }
}
