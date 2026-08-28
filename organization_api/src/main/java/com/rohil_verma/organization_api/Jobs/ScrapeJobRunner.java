package com.rohil_verma.organization_api.Jobs;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.rohil_verma.organization_api.Articles.ScraperClient;

import jakarta.annotation.PreDestroy;

/**
 * Drains the scrape queue. Two rules govern when work runs:
 *
 * <ul>
 *   <li>Jobs queued by a person pressing Update Feed run immediately.</li>
 *   <li>Background refresh jobs only run while the machine is idle, so summarization -
 *       which holds a multi-GB model in memory - does not compete with the user.</li>
 * </ul>
 */
@Component
public class ScrapeJobRunner {

    private static final Logger log = LoggerFactory.getLogger(ScrapeJobRunner.class);

    @Autowired private ScrapeJobService jobService;
    @Autowired private ScraperClient scraperClient;

    @Value("${scrape.max-concurrent:3}") private int maxConcurrent;
    @Value("${scrape.batch-size:3}") private int batchSize;
    /** Minutes of no keyboard/mouse input before background jobs are allowed. 0 disables the gate. */
    @Value("${scrape.idle-minutes:15}") private long idleMinutes;

    private ExecutorService executor;
    private volatile boolean idleCheckAvailable = true;

    private ExecutorService executor() {
        if (executor == null) {
            AtomicInteger counter = new AtomicInteger();
            ThreadFactory factory = runnable -> {
                Thread thread = new Thread(runnable, "scrape-worker-" + counter.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            };
            executor = Executors.newFixedThreadPool(Math.max(1, maxConcurrent), factory);
        }
        return executor;
    }

    /**
     * fixedDelay, not fixedRate: the next poll starts only after the previous drain has
     * finished, so a slow batch cannot stack up behind itself.
     */
    @Scheduled(fixedDelayString = "${scrape.poll-interval-ms:60000}", initialDelayString = "${scrape.initial-delay-ms:20000}")
    public void drain() {
        try {
            boolean idle = machineIsIdle();
            // When the user is active, only their own Update Feed requests are honoured.
            List<ScrapeJob> jobs = idle
                ? jobService.claim(batchSize, null)
                : jobService.claim(batchSize, ScrapeJob.SOURCE_USER);

            if (jobs.isEmpty()) return;
            log.info("Draining {} scrape job(s) (machine idle: {})", jobs.size(), idle);
            runAll(jobs);
        } catch (Exception e) {
            log.error("Scrape queue drain failed: {}", e.toString(), e);
        }
    }

    /** Runs a user's freshly queued work now, without waiting for the next poll tick. */
    public void kick() {
        CompletableFuture.runAsync(() -> {
            try {
                List<ScrapeJob> jobs = jobService.claim(batchSize, ScrapeJob.SOURCE_USER);
                if (!jobs.isEmpty()) {
                    log.info("Kick: draining {} user-requested job(s)", jobs.size());
                    runAll(jobs);
                }
            } catch (Exception e) {
                log.error("Kick failed: {}", e.toString(), e);
            }
        }, executor());
    }

    private void runAll(List<ScrapeJob> jobs) {
        List<CompletableFuture<Void>> futures = jobs.stream()
            .map(job -> CompletableFuture.runAsync(() -> runOne(job), executor()))
            .toList();
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
    }

    private void runOne(ScrapeJob job) {
        try {
            ScraperClient.ScrapeOutcome outcome =
                scraperClient.scrapeSite(job.getUsername(), job.getWebsiteURL(), job.getMode());
            if (outcome.success()) {
                jobService.markDone(job);
            } else {
                jobService.markFailed(job, outcome.message());
            }
        } catch (Exception e) {
            jobService.markFailed(job, e.toString());
        }
    }

    /**
     * Seconds since the last keyboard or mouse event, via macOS IOKit. Returns -1 where
     * that is unavailable (non-macOS, or the command fails), which is treated as "go ahead"
     * so the queue never silently stops draining on a machine we cannot measure.
     */
    long idleSeconds() {
        try {
            Process process = new ProcessBuilder("/bin/sh", "-c",
                "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'")
                .redirectErrorStream(true).start();
            String output;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                output = reader.readLine();
            }
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return -1;
            }
            return output == null || output.isBlank() ? -1 : Long.parseLong(output.trim());
        } catch (Exception e) {
            return -1;
        }
    }

    boolean machineIsIdle() {
        if (idleMinutes <= 0) return true;
        long seconds = idleSeconds();
        if (seconds < 0) {
            if (idleCheckAvailable) {
                log.warn("Idle detection unavailable on this platform - background jobs will run unrestricted");
                idleCheckAvailable = false;
            }
            return true;
        }
        return seconds >= idleMinutes * 60;
    }

    @PreDestroy
    void shutdown() {
        if (executor != null) executor.shutdown();
    }
}
