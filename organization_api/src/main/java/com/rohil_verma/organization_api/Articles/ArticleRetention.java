package com.rohil_verma.organization_api.Articles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Replaces DynamoDB's per-item TTL. Dynamo expired article and dedupe rows after seven
 * days as a background service with no code behind it; Postgres has no equivalent, so
 * the sweep has to be explicit.
 */
@Component
public class ArticleRetention {

    private static final int RETENTION_DAYS = 7;

    @Autowired
    private ArticleRepository articleRepository;

    @Autowired
    private SeenGuidRepository seenGuidRepository;

    @Scheduled(cron = "0 0 4 * * *")
    public void purgeExpired() {
        Instant cutoff = Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS);
        int articles = articleRepository.deleteByProcessedAtBefore(cutoff);
        int guids = seenGuidRepository.deleteByProcessedAtBefore(cutoff);
        System.out.println("[RETENTION] purged " + articles + " articles and " + guids + " guid markers older than " + cutoff);
    }
}
