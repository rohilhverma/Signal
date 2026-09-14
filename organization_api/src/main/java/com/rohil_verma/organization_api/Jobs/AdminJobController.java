package com.rohil_verma.organization_api.Jobs;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.rohil_verma.organization_api.Articles.ArticleRetention;

/**
 * The trigger surface for the nightly refresh, called by the launchd agent rather than by
 * a browser.
 *
 * <p>Enqueue used to be a Spring {@code @Scheduled} cron, which meant the decision to queue
 * work depended on the JVM being awake at 3am. It is not: Spring's cron trigger counts down
 * on a monotonic clock that stalls while macOS sleeps, so a slept-through fire is late or
 * skipped entirely, and nothing lands on the queue to survive anything. launchd's
 * {@code StartCalendarInterval} runs a missed interval as soon as the machine wakes, which
 * is the catch-up behaviour this actually needs.
 *
 * <p>{@code /status} exists so the caller can tell when the queue has drained and it is safe
 * to drop the caffeinate assertion and let the machine sleep again.
 */
@RestController
@RequestMapping("/admin/refresh")
public class AdminJobController {

    private static final Logger log = LoggerFactory.getLogger(AdminJobController.class);

    @Autowired private BackgroundRefreshScheduler refreshScheduler;
    @Autowired private ArticleRetention articleRetention;
    @Autowired private ScrapeJobRepository jobRepository;

    /**
     * Shared secret the launchd agent sends as X-Admin-Token. Checked here rather than left
     * to the filter chain because single-user mode authenticates every request, so the chain
     * would wave these through unguarded.
     */
    @Value("${scrape.admin-token:}")
    private String adminToken;

    @PostMapping("/enqueue")
    public ResponseEntity<?> enqueue(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!authorized(token)) return unauthorized();
        int queued = refreshScheduler.enqueueForAllUsers();
        return ResponseEntity.ok(Map.of("queued", queued));
    }

    /**
     * Expiry sweep: article/dedupe rows past retention, and finished scrape jobs past their
     * inspection window. Both used to be {@code @Scheduled} crons at 04:00 and 04:30, which
     * never fired once - the nightly script stops the JVM as soon as the queue drains, well
     * before either time. Running them here puts them inside the wake window the script is
     * already holding open, and gives them launchd's catch-up behaviour for free.
     */
    @PostMapping("/sweep")
    public ResponseEntity<?> sweep(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!authorized(token)) return unauthorized();
        ArticleRetention.Swept swept = articleRetention.purgeExpired();
        int jobs = refreshScheduler.purgeFinishedJobs();
        log.info("Sweep removed {} article(s), {} guid marker(s), {} finished job(s)",
            swept.articles(), swept.guids(), jobs);
        return ResponseEntity.ok(Map.of(
            "articles", swept.articles(),
            "guids", swept.guids(),
            "jobs", jobs));
    }

    @GetMapping("/status")
    public ResponseEntity<?> status(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!authorized(token)) return unauthorized();
        long pending = jobRepository.countByStatus(ScrapeJob.PENDING);
        long running = jobRepository.countByStatus(ScrapeJob.RUNNING);
        return ResponseEntity.ok(Map.of(
            "pending", pending,
            "running", running,
            "outstanding", pending + running));
    }

    /** Fails closed: an unset token disables the endpoint rather than opening it. */
    private boolean authorized(String supplied) {
        if (adminToken == null || adminToken.isBlank()) {
            log.error("scrape.admin-token is not set - /admin/refresh is disabled");
            return false;
        }
        if (supplied == null) return false;
        return MessageDigest.isEqual(
            supplied.getBytes(StandardCharsets.UTF_8),
            adminToken.getBytes(StandardCharsets.UTF_8));
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
    }
}
