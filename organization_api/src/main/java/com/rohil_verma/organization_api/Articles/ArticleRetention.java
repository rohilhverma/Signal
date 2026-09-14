package com.rohil_verma.organization_api.Articles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Replaces DynamoDB's per-item TTL. Dynamo expired article and dedupe rows after seven
 * days as a background service with no code behind it; Postgres has no equivalent, so
 * the sweep has to be explicit.
 *
 * <p>This is not optional housekeeping. {@link ArticleRepository#searchByWebsiteURLs} takes
 * no cutoff parameter on the grounds that retention already enforces one - if the sweep
 * stops running, search quietly becomes an unbounded scan over an ever-growing table.
 */
@Component
public class ArticleRetention {

    private static final Logger log = LoggerFactory.getLogger(ArticleRetention.class);

    private static final int RETENTION_DAYS = 7;

    @Autowired
    private ArticleRepository articleRepository;

    @Autowired
    private SeenGuidRepository seenGuidRepository;

    /** What one sweep removed. */
    public record Swept(int articles, int guids) {}

    /**
     * Disabled by default, like {@code scrape.enqueue-cron}, and for the same reason: this
     * used to run at 04:00, but {@code nightly-refresh.sh} stops the JVM as soon as the
     * queue drains - around 03:40 at the very latest - so a 04:00 cron never fired at all.
     * The launchd agent calls {@code POST /admin/refresh/sweep} inside the wake window
     * instead. Set a real expression here only on a machine that stays up.
     */
    @Scheduled(cron = "${retention.cron:-}")
    public void purgeExpiredScheduled() {
        purgeExpired();
    }

    public Swept purgeExpired() {
        Instant cutoff = Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS);
        int articles = articleRepository.deleteByProcessedAtBefore(cutoff);
        int guids = seenGuidRepository.deleteByProcessedAtBefore(cutoff);
        if (articles > 0 || guids > 0) {
            log.info("Retention purged {} article(s) and {} guid marker(s) older than {}", articles, guids, cutoff);
        }
        return new Swept(articles, guids);
    }
}
