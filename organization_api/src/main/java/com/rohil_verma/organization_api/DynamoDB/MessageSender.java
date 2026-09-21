package com.rohil_verma.organization_api.DynamoDB;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.awspring.cloud.sqs.operations.SqsTemplate;

/**
 * SQS fan-out: one message per subscribed site. This is the transport that replaces the
 * Postgres {@code scrape_jobs} queue, and every path that used to enqueue a {@code ScrapeJob}
 * now comes through here — {@code POST /user/task}, adding a source, and the nightly
 * {@code POST /admin/refresh/enqueue}.
 *
 * <p>What changes relative to the queue it replaces:
 * <ul>
 *   <li><b>Retries move to the queue.</b> SQS delivers a message more than once on failure, and
 *       the redrive policy plus a dead-letter queue replace {@code markFailed}'s
 *       {@code 5^attempts}-minute backoff and {@code MAX_ATTEMPTS} ceiling. That is a
 *       configuration concern now rather than application code.</li>
 *   <li><b>No {@code source=user} vs {@code source=scheduled} split.</b> User and background work
 *       share one queue, which is right: the Lambda runs in AWS, so the "only scrape while the
 *       laptop is idle" gate that justified the split no longer applies to it.</li>
 *   <li><b>Enqueue no longer needs the JVM to stay up.</b> The launchd agent only has to hold the
 *       machine awake long enough to post one request; the scraping then outlives the Mac going
 *       back to sleep, which it could not when the queue and the worker were both local.</li>
 * </ul>
 */
@Service
public class MessageSender {

    private static final Logger log = LoggerFactory.getLogger(MessageSender.class);

    /** Subscriptions store the frontend's vocabulary; the scraper's prompts use their own. */
    static final Map<String, String> SCRAPE_MODES = Map.of(
        "short", "shorter",
        "standard", "default",
        "deepDive", "longer"
    );
    static final String FALLBACK_MODE = "default";

    /**
     * A private mapper rather than an injected one.
     *
     * <p>The payload is a three-field record; Jackson is involved only so that a site key
     * containing a quote cannot produce a malformed message, which is exactly what the previous
     * hand-built {@code String.format("{\"website\":\"%s\"}", ...)} version would have done.
     * Depending on Boot to expose an {@code ObjectMapper} bean bought nothing here and broke
     * context startup when it did not.
     */
    private static final ObjectMapper JSON = new ObjectMapper();

    private final SqsTemplate sqsTemplate;
    private final String queueUrl;

    public MessageSender(SqsTemplate sqsTemplate,
                         @Value("${news_scraper_queue:}") String queueUrl) {
        this.sqsTemplate = sqsTemplate;
        this.queueUrl = queueUrl;
    }

    /**
     * The subscription-mode to scraper-mode translation.
     *
     * <p>Kept as a named method with its own test because this mapping was once missing
     * entirely, so every site was scraped at {@code default} no matter what the user picked and
     * nothing failed loudly. The job row used to carry the translated mode; the SQS message does.
     */
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
     * Sends one message per site, each carrying the already-translated mode.
     *
     * <p>A failure to send one site is logged and does not abort the rest — the same isolation
     * the per-job failure handling provided. The message body is serialized with Jackson rather
     * than {@code String.format}: site keys are user-supplied, and the previous hand-built JSON
     * would have produced a malformed message for any value containing a quote.
     *
     * @return how many messages were actually sent
     */
    public int sendScrapingTasks(String username, Map<String, String> subscriptions) {
        if (queueUrl == null || queueUrl.isBlank()) {
            log.error("news_scraper_queue is not set - nothing was enqueued. Scraping is off.");
            return 0;
        }
        if (subscriptions == null || subscriptions.isEmpty()) {
            log.info("No subscribed websites for user {} - nothing to enqueue", username);
            return 0;
        }

        int sent = 0;
        for (Map.Entry<String, String> entry : subscriptions.entrySet()) {
            String website = entry.getKey();
            try {
                ScrapeMessage message = new ScrapeMessage(
                    username, website, scrapeModeFor(website, entry.getValue()));
                sqsTemplate.send(queueUrl, JSON.writeValueAsString(message));
                sent++;
            } catch (Exception e) {
                log.error("Failed to enqueue site {} for user {}: {}", website, username, e.toString());
            }
        }
        log.info("Enqueued {} of {} site(s) for user {}", sent, subscriptions.size(), username);
        return sent;
    }

    /** Wire format the Lambda reads out of {@code event.Records[0].body}. */
    public record ScrapeMessage(String username, String website, String mode) { }
}
