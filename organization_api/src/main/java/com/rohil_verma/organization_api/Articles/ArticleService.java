package com.rohil_verma.organization_api.Articles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;

import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.rohil_verma.organization_api.Users.UserService;
import com.rohil_verma.organization_api.Website.WebsiteContent;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;


import org.springframework.scheduling.annotation.Async;
import static java.util.Map.entry;

@Service
public class ArticleService {

    @Autowired
    private UserService userService;
    
    @Autowired
    private ArticleRepository articleRepository;

    @Autowired
    private SiteFeedRepository siteFeedRepository;

    @Autowired
    private GeminiModel geminiModel;

    private final HashMap<String,String> promptMap = new HashMap<String,String>(Map.ofEntries(
        entry("shorter","You are a news wire editor. Summarize each article in 2-3 bullet points. Each bullet must be one sentence, maximum 20 words. Bullet 1: What happened — the core event, stated as a fact. Bullet 2: Who is involved and what specifically they did. Bullet 3 (only if needed): A key number or outcome that adds value. Rules: No filler phrases like \"it's worth noting\" or \"according to\"; No background or history unless critical to understanding the event; If a bullet doesn't add new information, cut it; Start each bullet with the subject, not a verb. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\"."),
        entry("default","You are a news briefing editor. For each article, write a single paragraph summary of 4-6 sentences. Each summary must include: 1. The core event — what happened, stated directly; 2. Context — how this connects to related events or industry trends; 3. Implication — what this signals or why it matters going forward; 4. Key specifics — include relevant numbers, names, and concrete details. Write in a flowing paragraph, not bullet points. Do not use filler phrases. State facts directly with no editorializing. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\"."),
        entry("longer","You are a senior analyst writing intelligence briefings. For each article, you MUST write exactly 3 paragraphs separated by blank lines. No more, no fewer.\n\nParagraph 1 — What happened: who was involved, concrete specifics, relevant numbers, names, dates, and technical details from the article.\n\nParagraph 2 — Context: how this event connects to related developments, competing efforts, or previous events. Draw only from information within the article. If the article provides little context, connect the facts and details stated in paragraph 1.\n\nParagraph 3 — Implications: what this signals going forward, based only on what the article states or directly implies. If implications are not explicit, derive them logically from the facts in paragraph 1.\n\nRules:\n- Output MUST be exactly 3 paragraphs separated by blank lines\n- No labels, headers, or markers before paragraphs\n- No filler phrases or editorializing\n- Never introduce outside knowledge\n- Every sentence must be traceable to the article text\n\nReturn ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".")    
    ));

    private Cache<String,String> articleTextCache = Caffeine.newBuilder()
    .expireAfterWrite(1,TimeUnit.DAYS)
    .build();

    private Cache<String, Map<String,WebsiteContent>> userContentCache = Caffeine.newBuilder()
    .expireAfterWrite(30, TimeUnit.SECONDS)
    .build();

    /** Public so the sources screen counts over the same window the dashboard reads. */
    public static final int FRESHNESS_HOURS = 24;

    public Map<String, WebsiteContent> getUserContent(String username){
        Map<String, WebsiteContent> cached = userContentCache.getIfPresent(username);
        if (cached != null) return cached;

        List<String> userWebsites = userService.getVisibleWebsitesForUser(username);

        Map<String, WebsiteContent> returnMap = new HashMap<>();
        if (userWebsites.isEmpty()) {
            userContentCache.put(username, returnMap);
            return returnMap;
        }

        Instant cutoff = Instant.now().minus(FRESHNESS_HOURS, ChronoUnit.HOURS);

        Map<String, SiteFeed> feeds = new HashMap<>();
        for (SiteFeed feed : siteFeedRepository.findByWebsiteURLIn(userWebsites)) {
            feeds.put(feed.getWebsiteURL(), feed);
        }

        Map<String, List<Map<String, Map<String, String>>>> articlesBySite = new HashMap<>();
        for (ArticleFeedView view : articleRepository
                .findByWebsiteURLInAndProcessedAtAfterOrderByProcessedAtDesc(userWebsites, cutoff)) {
            if (view.getTitle() == null || view.getPublishedAt() == null) continue;

            Map<String, String> articleContents = new HashMap<>();
            articleContents.put("date", view.getPublishedAt());
            articleContents.put("processedAt", view.getProcessedAt().toString());
            articleContents.put("link", view.getLink());
            articleContents.put("summaryDefault", view.getSummaryDefault() != null ? view.getSummaryDefault() : "");
            articleContents.put("summaryShort", view.getSummaryShort() != null ? view.getSummaryShort() : "");
            articleContents.put("summaryLong", view.getSummaryLong() != null ? view.getSummaryLong() : "");
            articleContents.put("wordCount", view.getWordCount() != null ? String.valueOf(view.getWordCount()) : "0");

            Map<String, Map<String, String>> article = new HashMap<>();
            article.put(view.getTitle(), articleContents);
            articlesBySite.computeIfAbsent(view.getWebsiteURL(), key -> new ArrayList<>()).add(article);
        }

        for (String website : userWebsites) {
            SiteFeed feed = feeds.get(website);
            String paywallStatus = (feed != null && feed.getPaywall() != null) ? String.valueOf(feed.getPaywall()) : null;
            String siteName = (feed != null && feed.getSiteName() != null) ? feed.getSiteName() : "";
            returnMap.put(website, new WebsiteContent(paywallStatus, siteName,
                articlesBySite.getOrDefault(website, new ArrayList<>())));
        }

        userContentCache.put(username, returnMap);
        return returnMap;
    }

    public ConcurrentMap<String, @NonNull String> cacheContent(){
        return articleTextCache.asMap();
    }

    /**
     * Drops a user's cached dashboard. Called when the set of sources they can see changes -
     * without it a mute would appear to do nothing for up to the cache's 30 second TTL, which
     * reads as a broken button rather than a slow one.
     */
    public void invalidateUserContent(String username){
        userContentCache.invalidate(username);
    }

    /**
     * Search over whatever the 7-day retention window still holds, scoped to the sites
     * the user actually subscribes to - the same scoping {@link #getUserContent} applies
     * to the dashboard read, so a search result is never something outside what the user
     * would otherwise see in their feed.
     */
    public List<ArticleFeedView> searchUserArticles(String username, String term) {
        String trimmed = term == null ? "" : term.trim();
        if (trimmed.length() < 2) return List.of();

        List<String> userWebsites = userService.getVisibleWebsitesForUser(username);
        if (userWebsites.isEmpty()) return List.of();

        return articleRepository.searchByWebsiteURLs(userWebsites, trimmed);
    }

    @Async
    public void updateSummary(String pk, String articleUrl, String mode, String resummarization) throws Exception {
        int updated = switch (mode) {
            case "shorter" -> articleRepository.updateSummaryShort(pk, articleUrl, resummarization);
            case "default" -> articleRepository.updateSummaryDefault(pk, articleUrl, resummarization);
            default -> articleRepository.updateSummaryLong(pk, articleUrl, resummarization);
        };
        if (updated == 0) {
            System.out.println("[RESUMMARIZE] no article matched site=" + pk + " link=" + articleUrl
                + " - summary was generated but not persisted");
        }
    }

    public String resummarizeRequest(String url, String mode){
        String articleText = articleTextCache.getIfPresent(url);
        if (articleText == null) {
            articleText = articleRepository.findArticleTextByLink(url);
            if (articleText != null) articleTextCache.put(url, articleText);
        }
        if (articleText == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No stored article text for " + url);
        }
        return geminiModel.handleResummarize(mode, promptMap.get(mode), articleText);
    }
}
