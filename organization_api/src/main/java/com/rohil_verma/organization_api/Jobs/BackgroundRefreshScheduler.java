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
     * the runner finds the machine idle.
     *
     * <p>A failure for one user is logged and skipped rather than aborting the sweep, so one
     * broken account cannot cost everyone else their nightly refresh.
     *
     * @return how many jobs were created across all users
     */
    public int enqueueForAllUsers() {
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
        return totalQueued;
    }

    /**
     * In-JVM fallback trigger, disabled by default - {@code scrape.enqueue-cron} ships as
     * "-", Spring's value for a cron that never fires. The real trigger is the launchd agent
     * calling {@link AdminJobController}, because launchd catches up an interval missed
     * while the Mac was asleep and this scheduler does not. Set a cron expression here only
     * on a machine that stays awake.
     */
    @Scheduled(cron = "${scrape.enqueue-cron:-}")
    public void enqueueBackgroundRefresh() {
        enqueueForAllUsers();
    }

    /**
     * Finished jobs are kept briefly for inspection, then cleared.
     *
     * <p>Disabled by default for the same reason as {@code scrape.enqueue-cron}: at 04:30
     * this JVM no longer exists, because the nightly script stops the API as soon as the
     * queue drains. {@code POST /admin/refresh/sweep} runs it inside the wake window.
     */
    @Scheduled(cron = "${scrape.purge-cron:-}")
    public void purgeFinishedJobsScheduled() {
        purgeFinishedJobs();
    }

    public int purgeFinishedJobs() {
        int purged = jobRepository.purgeFinishedBefore(Instant.now().minus(3, ChronoUnit.DAYS));
        if (purged > 0) log.info("Purged {} finished scrape job(s)", purged);
        return purged;
    }
}
