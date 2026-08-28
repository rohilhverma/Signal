package com.rohil_verma.organization_api.Jobs;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Enqueue and lifecycle for scrape jobs. The subscription-mode to scraper-mode
 * translation happens here, at the moment work is queued, so a job row always carries a
 * mode the scraper actually understands.
 */
@Service
public class ScrapeJobService {

    private static final Logger log = LoggerFactory.getLogger(ScrapeJobService.class);

    /** Subscriptions store the frontend's vocabulary; the scraper's prompts use their own. */
    static final Map<String, String> SCRAPE_MODES = Map.of(
        "short", "shorter",
        "standard", "default",
        "deepDive", "longer"
    );
    static final String FALLBACK_MODE = "default";

    /** Give up after this many tries so a permanently broken site stops being retried forever. */
    private static final int MAX_ATTEMPTS = 3;

    @Autowired
    private ScrapeJobRepository jobRepository;

    /**
     * Queues one job per subscribed site. A site that already has pending or running work
     * is skipped, so repeated Update Feed presses do not pile up duplicates.
     *
     * @return how many jobs were actually created
     */
    @Transactional
    public int enqueue(String username, Map<String, String> subscriptions, String source) {
        if (subscriptions == null || subscriptions.isEmpty()) {
            log.info("No subscribed websites for user {} - nothing to enqueue", username);
            return 0;
        }
        int created = 0;
        for (Map.Entry<String, String> entry : subscriptions.entrySet()) {
            String website = entry.getKey();
            if (jobRepository.existsByUsernameAndWebsiteURLAndStatusIn(
                    username, website, List.of(ScrapeJob.PENDING, ScrapeJob.RUNNING))) {
                log.debug("Skipping {} for {} - already queued", website, username);
                continue;
            }
            jobRepository.save(new ScrapeJob(username, website, scrapeModeFor(website, entry.getValue()), source));
            created++;
        }
        log.info("Enqueued {} of {} site(s) for user {} (source={})",
            created, subscriptions.size(), username, source);
        return created;
    }

    static String scrapeModeFor(String website, String contentMode) {
        String mode = contentMode == null ? null : SCRAPE_MODES.get(contentMode);
        if (mode == null) {
            log.warn("Unrecognised content mode '{}' for site {} - falling back to '{}'",
                contentMode, website, FALLBACK_MODE);
            return FALLBACK_MODE;
        }
        return mode;
    }

    /**
     * Claims up to {@code limit} due jobs and flips them to running. Runs in its own
     * transaction so the row locks are released as soon as the claim commits - the work
     * itself happens afterwards, outside any transaction.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<ScrapeJob> claim(int limit, String sourceFilter) {
        List<ScrapeJob> jobs = sourceFilter == null
            ? jobRepository.lockNext(limit)
            : jobRepository.lockNextBySource(sourceFilter, limit);

        for (ScrapeJob job : jobs) {
            job.setStatus(ScrapeJob.RUNNING);
            job.setAttempts(job.getAttempts() + 1);
            job.setUpdatedAt(Instant.now());
        }
        return jobRepository.saveAll(jobs);
    }

    @Transactional
    public void markDone(ScrapeJob job) {
        job.setStatus(ScrapeJob.DONE);
        job.setLastError(null);
        job.setUpdatedAt(Instant.now());
        jobRepository.save(job);
    }

    /**
     * Reschedules with exponential backoff, or gives up once MAX_ATTEMPTS is reached.
     * This is the at-least-once retry that SQS used to provide and that plain HTTP does not.
     */
    @Transactional
    public void markFailed(ScrapeJob job, String error) {
        job.setLastError(error == null ? "unknown error" : error.substring(0, Math.min(error.length(), 1000)));
        job.setUpdatedAt(Instant.now());
        if (job.getAttempts() >= MAX_ATTEMPTS) {
            job.setStatus(ScrapeJob.FAILED);
            log.error("Job {} gave up after {} attempts: {}", job, job.getAttempts(), job.getLastError());
        } else {
            long backoffMinutes = (long) Math.pow(5, job.getAttempts());
            job.setStatus(ScrapeJob.PENDING);
            job.setScheduledFor(Instant.now().plus(backoffMinutes, ChronoUnit.MINUTES));
            log.warn("Job {} failed (attempt {}), retrying in {}min: {}",
                job, job.getAttempts(), backoffMinutes, job.getLastError());
        }
        jobRepository.save(job);
    }
}
