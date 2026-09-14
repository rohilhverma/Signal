package com.rohil_verma.organization_api.Personalization;

import java.time.Instant;
import java.util.List;

/** One ranked article in the {@code /user/feed/foryou} response. Shape is fixed by the frontend. */
public class ForYouArticle {

    private final String link;
    private final String websiteURL;
    private final String title;
    private final String summaryShort;
    private final String summaryDefault;
    private final String summaryLong;
    private final String publishedAt;
    private final Instant processedAt;
    private final int wordCount;
    private final List<String> topics;
    private final double score;
    private final ScoreExplain explain;

    public ForYouArticle(String link, String websiteURL, String title, String summaryShort,
                          String summaryDefault, String summaryLong, String publishedAt,
                          Instant processedAt, int wordCount, List<String> topics,
                          double score, ScoreExplain explain) {
        this.link = link;
        this.websiteURL = websiteURL;
        this.title = title;
        this.summaryShort = summaryShort;
        this.summaryDefault = summaryDefault;
        this.summaryLong = summaryLong;
        this.publishedAt = publishedAt;
        this.processedAt = processedAt;
        this.wordCount = wordCount;
        this.topics = topics == null ? List.of() : topics;
        this.score = score;
        this.explain = explain;
    }

    public String getLink() { return link; }
    public String getWebsiteURL() { return websiteURL; }
    public String getTitle() { return title; }
    public String getSummaryShort() { return summaryShort; }
    public String getSummaryDefault() { return summaryDefault; }
    public String getSummaryLong() { return summaryLong; }
    public String getPublishedAt() { return publishedAt; }
    public Instant getProcessedAt() { return processedAt; }
    public int getWordCount() { return wordCount; }
    public List<String> getTopics() { return topics; }
    public double getScore() { return score; }
    public ScoreExplain getExplain() { return explain; }
}
