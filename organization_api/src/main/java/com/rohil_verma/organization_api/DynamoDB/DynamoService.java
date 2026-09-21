 package com.rohil_verma.organization_api.DynamoDB;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.rohil_verma.organization_api.Users.UserService;
import com.rohil_verma.organization_api.Website.WebsiteContent;

/**
 * The dashboard read path over DynamoDB, plus on-demand re-summarization.
 *
 * <p>Replaces {@code Articles.ArticleService}. The payload it returns is deliberately
 * byte-identical to the one the Postgres build produced — the same {@code WebsiteContent} shape
 * with the same field keys ({@code date}, {@code processedAt}, {@code link},
 * {@code summaryShort}, {@code summaryDefault}, {@code summaryLong}). Three frontend views read
 * it (dashboard, Hot Topics, keyword filtering) and they were written against that shape, so
 * changing the store underneath is only safe because this contract did not move.
 *
 * <p>Two things are deliberately better than the version this replaces:
 * <ul>
 *   <li>Article bodies are no longer read on the dashboard path. The query projects the feed
 *       fields only, where the old one pulled {@code articleText} for every article on every
 *       8-second poll purely to warm a cache.</li>
 *   <li>Re-summarization fetches the body it needs from the article itself, so the old
 *       "Cache miss: call /user/website first" failure mode is gone.</li>
 * </ul>
 */
@Service
public class DynamoService {

    /** The dashboard's freshness window. Also the window the sources screen counts over. */
    public static final int FRESHNESS_HOURS = 24;

    /** Matches the SQL {@code LIMIT 50} this search replaces. */
    private static final int SEARCH_LIMIT = 50;

    /** Shorter terms return an empty list rather than a full-table dump. */
    private static final int MIN_SEARCH_TERM_LENGTH = 2;

    @Autowired
    private UserService userService;

    @Autowired
    private DynamoArticleRepository articleRepository;

    @Autowired
    private GeminiModel geminiModel;

    /**
     * 30 seconds: long enough to collapse the dashboard's polling and the frontend's burst of
     * parallel requests, short enough that a scrape landing is visible without a manual refresh.
     */
    private final Cache<String, Map<String, WebsiteContent>> userContentCache = Caffeine.newBuilder()
        .expireAfterWrite(30, TimeUnit.SECONDS)
        .build();

    public Map<String, WebsiteContent> getUserContent(String username) {
        Map<String, WebsiteContent> cached = userContentCache.getIfPresent(username);
        if (cached != null) return cached;

        List<String> userWebsites = userService.getVisibleWebsitesForUser(username);
        Map<String, WebsiteContent> returnMap = new LinkedHashMap<>();
        if (userWebsites.isEmpty()) {
            userContentCache.put(username, returnMap);
            return returnMap;
        }

        Instant cutoff = Instant.now().minus(FRESHNESS_HOURS, ChronoUnit.HOURS);
        Map<String, DynamoArticleRepository.SiteMeta> siteMeta =
            articleRepository.findSiteMeta(userWebsites);
        Map<String, List<FeedArticle>> articlesBySite = articleRepository
            .findFeedArticles(userWebsites, cutoff)
            .stream()
            .collect(Collectors.groupingBy(FeedArticle::getWebsiteURL));

        for (String website : userWebsites) {
            List<Map<String, Map<String, String>>> articleList = new ArrayList<>();
            for (FeedArticle article : articlesBySite.getOrDefault(website, List.of())) {
                // The frontend parses both of these with new Date(...). An item missing either
                // would render as "Invalid Date", so it is left out of the payload entirely —
                // which is also what the previous implementation did.
                if (article.getPublishedAt() == null || article.getProcessedAt() == null) continue;

                Map<String, String> fields = new LinkedHashMap<>();
                fields.put("date", article.getPublishedAt());
                fields.put("processedAt", article.getProcessedAt().toString());
                fields.put("link", nullToEmpty(article.getLink()));
                fields.put("summaryShort", nullToEmpty(article.getSummaryShort()));
                fields.put("summaryDefault", nullToEmpty(article.getSummaryDefault()));
                fields.put("summaryLong", nullToEmpty(article.getSummaryLong()));

                Map<String, Map<String, String>> entry = new LinkedHashMap<>();
                entry.put(nullToEmpty(article.getTitle()), fields);
                articleList.add(entry);
            }

            DynamoArticleRepository.SiteMeta meta = siteMeta.get(website);
            returnMap.put(website, new WebsiteContent(
                meta == null || meta.paywall() == null ? null : String.valueOf(meta.paywall()),
                meta == null || meta.siteName() == null ? "" : meta.siteName(),
                articleList));
        }

        userContentCache.put(username, returnMap);
        return returnMap;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /**
     * Drops a user's cached dashboard. Called when the set of sources they can see changes —
     * without it a mute would appear to do nothing for up to the cache's 30-second TTL, which
     * reads as a broken button rather than a slow one.
     */
    public void invalidateUserContent(String username) {
        userContentCache.invalidate(username);
    }

    /**
     * Search over whatever TTL has not expired, scoped to the sites the user actually subscribes
     * to — the same scoping the dashboard read applies, so a result is never something outside
     * what the user would otherwise see in their feed.
     *
     * <p>There is no server-side text search here, and that is the one read the store swap could
     * not preserve: DynamoDB has no {@code ILIKE}, and the sort key is the article link, so there
     * is no useful prefix to query on either. Filtering in memory over the already-fetched window
     * is the honest answer at this size — the window is bounded by the 7-day TTL rather than by a
     * cutoff argument, which is exactly the invariant the Postgres version maintained by having
     * no cutoff parameter. If this ever needs to scale, the answer is a search index, not a Scan.
     */
    public List<FeedArticle> searchUserArticles(String username, String term) {
        String trimmed = term == null ? "" : term.trim();
        if (trimmed.length() < MIN_SEARCH_TERM_LENGTH) return List.of();

        List<String> userWebsites = userService.getVisibleWebsitesForUser(username);
        if (userWebsites.isEmpty()) return List.of();

        String needle = trimmed.toLowerCase(Locale.ROOT);
        return articleRepository.findFeedArticles(userWebsites, null).stream()
            .filter(article -> contains(article.getTitle(), needle)
                || contains(article.getSummaryDefault(), needle))
            .limit(SEARCH_LIMIT)
            .toList();
    }

    private static boolean contains(String haystack, String lowercaseNeedle) {
        return haystack != null && haystack.toLowerCase(Locale.ROOT).contains(lowercaseNeedle);
    }

    /**
     * Generates a summary at a different depth from the article text already stored.
     *
     * @throws ResponseStatusException 404 when the article is gone — expired by TTL, or a link
     *         that was never stored. Persisting the result is the caller's separate step, so a
     *         404 leaves any existing summary untouched rather than blanking it.
     */
    public String resummarizeRequest(String articleLink, String mode) {
        String articleText = articleRepository.findArticleText(articleLink)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "No stored article text for " + articleLink));
        return geminiModel.handleResummarize(mode, articleText);
    }

    /**
     * Writes a regenerated summary into its own slot of the three-slot list, on its own thread.
     *
     * <p>Async because the HTTP response already carries the generated text — the write is a
     * durability step the user is not waiting on. Only this mode's slot is touched, so asking for
     * a deep dive cannot overwrite the short summary that was served a moment earlier.
     */
    @Async
    public void updateSummary(String siteKey, String articleLink, String mode, String summary) {
        articleRepository.updateSummarySlot(siteKey, articleLink, slotFor(mode), summary);
    }

    /** Accepts either vocabulary, so a caller cannot silently write into the wrong depth. */
    static int slotFor(String mode) {
        if ("shorter".equals(mode) || "short".equals(mode)) return DynamoArticleRepository.SLOT_SHORTER;
        if ("longer".equals(mode) || "deepDive".equals(mode)) return DynamoArticleRepository.SLOT_LONGER;
        return DynamoArticleRepository.SLOT_DEFAULT;
    }
}
