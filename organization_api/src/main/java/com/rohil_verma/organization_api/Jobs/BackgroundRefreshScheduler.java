package com.rohil_verma.organization_api.Jobs;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.rohil_verma.organization_api.Users.User;
import com.rohil_verma.organization_api.Users.UserRepository;
import com.rohil_verma.organization_api.Users.UserService;

/**
 * Puts background work on the queue. Kept separate from {@link ScrapeJobRunner}, which
 * drains it: UserService needs the runner in order to kick user-requested jobs, so the
 * runner cannot in turn depend on UserService without creating a cycle.
 */
@Component
public class BackgroundRefreshScheduler {

    private static final Logger log = LoggerFactory.getLogger(BackgroundRefreshScheduler.class);

    @Autowired private ScrapeJobService jobService;
    @Autowired private ScrapeJobRepository jobRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private UserService userService;

    /**
     * Queues a refresh for every user. Nothing runs yet - the jobs sit on the table until
     * the runner finds the machine idle. If the Mac is asleep at this hour the work is not
     * lost, which is the whole reason for having a queue rather than a timed scrape.
     */
    @Scheduled(cron = "${scrape.enqueue-cron:0 0 3 * * *}")
    public void enqueueBackgroundRefresh() {
        int totalQueued = 0;
        for (User user : userRepository.findAll()) {
            try {
                totalQueued += jobService.enqueue(user.getUsername(),
                    userService.getSubscriptionModesForUser(user.getUsername()),
                    ScrapeJob.SOURCE_SCHEDULED);
            } catch (Exception e) {
                log.error("Failed to enqueue background refresh for {}: {}", user.getUsername(), e.toString());
            }
        }
        log.info("Background refresh queued {} job(s)", totalQueued);
    }

    /** Finished jobs are kept briefly for inspection, then cleared. */
    @Scheduled(cron = "${scrape.purge-cron:0 30 4 * * *}")
    public void purgeFinishedJobs() {
        int purged = jobRepository.purgeFinishedBefore(Instant.now().minus(3, ChronoUnit.DAYS));
        if (purged > 0) log.info("Purged {} finished scrape job(s)", purged);
    }
}
