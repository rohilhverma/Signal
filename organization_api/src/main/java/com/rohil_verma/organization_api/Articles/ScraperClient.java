package com.rohil_verma.organization_api.Articles;

import java.net.http.HttpClient;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;


/**
 * Talks to the local Node scraper service over HTTP. Replaces the old SQS fan-out:
 * one POST /scrape per subscribed website, issued concurrently on a small bounded pool.
 *
 * <p>Dispatch is fire-and-forget, matching the previous SQS semantics — the callers
 * ({@code POST /user/task}, {@code addUser}) return immediately and the frontend polls
 * the feed until the article count plateaus. Unlike SQS there is no retry and no
 * at-least-once guarantee, so every failure is logged rather than swallowed.
 */
@Service
public class ScraperClient {

    private static final Logger log = LoggerFactory.getLogger(ScraperClient.class);

    /** Scraping a single site legitimately takes a minute or more (RSS probe + Playwright + Gemini). */
    private static final Duration READ_TIMEOUT = Duration.ofMinutes(5);
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);

    private final RestClient restClient;

    public ScraperClient(@Value("${scraper.base-url}") String baseUrl) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
        requestFactory.setReadTimeout(READ_TIMEOUT);

        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(requestFactory)
            .build();

        log.info("ScraperClient targeting {} (connect {}s, read {}s)",
            baseUrl, CONNECT_TIMEOUT.toSeconds(), READ_TIMEOUT.toSeconds());
    }

    /** Outcome of one scrape attempt, so the job queue can decide whether to retry. */
    public record ScrapeOutcome(boolean success, String message) { }

    /**
     * Scrapes one site and blocks until the scraper answers. Callers run this on their own
     * thread; the job runner owns concurrency and retry policy.
     */
    public ScrapeOutcome scrapeSite(String username, String website, String mode) {
        try {
            ResponseEntity<ScrapeResponse> response = restClient.post()
                .uri("/scrape")
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ScrapeRequest(username, website, mode))
                .retrieve()
                // Suppress the default throw-on-error so the JSON error body can be read.
                .onStatus(HttpStatusCode::isError, (request, errorResponse) -> { })
                .toEntity(ScrapeResponse.class);

            ScrapeResponse body = response.getBody();
            if (response.getStatusCode().isError()) {
                String detail = body != null && body.error() != null ? body.error() : "no error body";
                log.error("Scrape failed for site {} (user {}): HTTP {} - {}",
                    website, username, response.getStatusCode().value(), detail);
                return new ScrapeOutcome(false, "HTTP " + response.getStatusCode().value() + " - " + detail);
            }
            if (body == null) {
                log.warn("Scrape for site {} (user {}) returned HTTP {} with an empty body",
                    website, username, response.getStatusCode().value());
                return new ScrapeOutcome(false, "empty response body");
            }
            int added = body.articlesAdded() != null ? body.articlesAdded() : 0;
            log.info("Scrape finished for site {} (mode {}, user {}): {} article(s) added, paywalled={}",
                website, mode, username, added, body.paywalled());
            return new ScrapeOutcome(true, added + " article(s) added");
        } catch (Exception e) {
            // Includes connect refused (scraper not running), read timeout, unparseable bodies.
            log.error("Scrape request failed for site {} (user {}): {}", website, username, e.toString());
            return new ScrapeOutcome(false, e.toString());
        }
    }

    record ScrapeRequest(String username, String website, String mode) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ScrapeResponse(String website, Integer articlesAdded, Boolean paywalled, String error) { }
}
