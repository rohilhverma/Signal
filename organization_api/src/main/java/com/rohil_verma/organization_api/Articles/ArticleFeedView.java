package com.rohil_verma.organization_api.Articles;

import java.time.Instant;

/**
 * Closed projection for the feed read path. Deliberately omits articleText so the
 * dashboard query does not drag every article body out of the database on every poll.
 */
public interface ArticleFeedView {
    String getWebsiteURL();
    String getLink();
    String getTitle();
    String getSummaryShort();
    String getSummaryDefault();
    String getSummaryLong();
    Integer getWordCount();
    String getPublishedAt();
    Instant getProcessedAt();
    String getTopics();
}
