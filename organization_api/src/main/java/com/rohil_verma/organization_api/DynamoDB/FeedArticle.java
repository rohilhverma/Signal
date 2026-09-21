package com.rohil_verma.organization_api.DynamoDB;

import java.time.Instant;

/**
 * One article as the read paths see it, mapped off a DynamoDB item.
 *
 * <p>Replaces the JPA projection interface {@code Articles.ArticleFeedView}. It is a concrete
 * class with JavaBean getters rather than a record on purpose: every consumer
 * ({@code PersonalizationService}, the search endpoint, {@code DynamoService}) already reads
 * these fields as {@code getX()}, so keeping that shape meant the personalization rewrite
 * touched the repository type and nothing else.
 *
 * <p>{@code articleText} is deliberately absent. The dashboard polls every 8 seconds, and the
 * feed fields are a few hundred bytes where the body is tens of kilobytes — so the query
 * projects only what the feed renders and the body is fetched separately, only when a user
 * asks for a different summary depth. That was the point of the projection in the Postgres
 * build and it matters more here, where every byte is a read unit.
 */
public class FeedArticle {

    private final String websiteURL;
    private final String link;
    private final String title;
    private final String summaryShort;
    private final String summaryDefault;
    private final String summaryLong;
    private final Integer wordCount;
    private final String publishedAt;
    private final Instant processedAt;
    private final String topics;

    public FeedArticle(String websiteURL, String link, String title, String summaryShort,
                       String summaryDefault, String summaryLong, Integer wordCount,
                       String publishedAt, Instant processedAt, String topics) {
        this.websiteURL = websiteURL;
        this.link = link;
        this.title = title;
        this.summaryShort = summaryShort;
        this.summaryDefault = summaryDefault;
        this.summaryLong = summaryLong;
        this.wordCount = wordCount;
        this.publishedAt = publishedAt;
        this.processedAt = processedAt;
        this.topics = topics;
    }

    public String getWebsiteURL() { return websiteURL; }
    public String getLink() { return link; }
    public String getTitle() { return title; }
    public String getSummaryShort() { return summaryShort; }
    public String getSummaryDefault() { return summaryDefault; }
    public String getSummaryLong() { return summaryLong; }
    public Integer getWordCount() { return wordCount; }
    public String getPublishedAt() { return publishedAt; }
    public Instant getProcessedAt() { return processedAt; }
    public String getTopics() { return topics; }
}
