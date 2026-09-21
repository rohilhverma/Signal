package com.rohil_verma.organization_api.Jobs;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
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

import com.rohil_verma.organization_api.DynamoDB.MessageSender;
import com.rohil_verma.organization_api.Users.User;
import com.rohil_verma.organization_api.Users.UserRepository;
import com.rohil_verma.organization_api.Users.UserService;

import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesResponse;
import software.amazon.awssdk.services.sqs.model.QueueAttributeName;

/**
 * The trigger surface for the nightly refresh, called by the launchd agent rather than by a
 * browser. All that survives of the {@code Jobs} package: the queue is SQS now, so there is no
 * job table, no drain loop, and no {@code scrape.enqueue-cron}.
 *
 * <p>Enqueue used to be a Spring {@code @Scheduled} cron, which made the decision to queue work
 * depend on the JVM being awake at 3am. It is not: Spring's cron counts down on a monotonic clock
 * that stalls while macOS sleeps. launchd's {@code StartCalendarInterval} runs a missed interval
 * as soon as the machine wakes, which is the catch-up behaviour this needs.
 *
 * <p>Restoring SQS makes the split of duties better than either previous version. The Mac only has
 * to be awake long enough to read subscriptions out of Postgres and post one request here; the
 * scraping then runs entirely in AWS and outlives the machine going back to sleep. With the
 * Postgres queue, the same script had to hold a {@code caffeinate} assertion for up to 40 minutes
 * waiting for a local worker to drain.
 */
@RestController
@RequestMapping("/admin/refresh")
public class AdminRefreshController {

    private static final Logger log = LoggerFactory.getLogger(AdminRefreshController.class);

    @Autowired private UserRepository userRepository;
    @Autowired private UserService userService;
    @Autowired private MessageSender messageSender;
    @Autowired private SqsAsyncClient sqsClient;

    /** Resolved once, lazily: a bare name needs a GetQueueUrl call, a URL does not. */
    private volatile String resolvedQueueUrl;

    /**
     * Shared secret the launchd agent sends as {@code X-Admin-Token}. Checked here rather than
     * left to the filter chain because single-user mode authenticates every request, so the chain
     * would wave these through unguarded.
     */
    @Value("${scrape.admin-token:}")
    private String adminToken;

    @Value("${news_scraper_queue:}")
    private String queue;

    /**
     * Queues a refresh for every user: one SQS message per subscribed site. A failure for one
     * user is logged and skipped rather than aborting the sweep, so one broken account cannot cost
     * everyone else their nightly refresh.
     */
    @PostMapping("/enqueue")
    public ResponseEntity<?> enqueue(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!authorized(token)) return unauthorized();

        int queued = 0;
        for (User user : userRepository.findAll()) {
            try {
                queued += messageSender.sendScrapingTasks(user.getUsername(),
                    userService.getSubscriptionModesForUser(user.getUsername()));
            } catch (Exception e) {
                log.error("Failed to enqueue background refresh for {}: {}", user.getUsername(), e.toString());
            }
        }
        log.info("Background refresh queued {} message(s)", queued);
        return ResponseEntity.ok(Map.of("queued", queued));
    }

    /**
     * SQS queue depth. Kept because watching a nightly run land is genuinely useful, and because
     * the launchd script already parses {@code outstanding}.
     *
     * <p>Advisory rather than authoritative: a message being retried or in flight is counted, and a
     * queue with a redrive policy reports only what is currently on it. A {@code -1} means the
     * depth could not be read — no queue configured, or no {@code sqs:GetQueueAttributes}.
     */
    @GetMapping("/status")
    public ResponseEntity<?> status(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!authorized(token)) return unauthorized();

        long pending = queueDepth(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES);
        long running = queueDepth(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_NOT_VISIBLE);
        long outstanding = (pending < 0 || running < 0) ? -1 : pending + running;
        return ResponseEntity.ok(Map.of(
            "pending", pending,
            "running", running,
            "outstanding", outstanding));
    }

    private long queueDepth(QueueAttributeName attribute) {
        try {
            String url = queueUrl();
            if (url == null) return -1;
            GetQueueAttributesResponse response = sqsClient.getQueueAttributes(builder -> builder
                .queueUrl(url)
                .attributeNames(List.of(attribute))).join();
            String value = response.attributes().get(attribute);
            return value == null ? -1 : Long.parseLong(value);
        } catch (Exception e) {
            log.warn("Could not read SQS attribute {}: {}", attribute, e.toString());
            return -1;
        }
    }

    /** Accepts a bare queue name (resolved via GetQueueUrl) or a full URL. */
    private String queueUrl() {
        if (queue == null || queue.isBlank()) return null;
        if (queue.startsWith("http")) return queue;
        if (resolvedQueueUrl == null) {
            resolvedQueueUrl = sqsClient.getQueueUrl(builder -> builder.queueName(queue))
                .join().queueUrl();
        }
        return resolvedQueueUrl;
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
