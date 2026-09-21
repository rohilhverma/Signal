package com.rohil_verma.organization_api.DynamoDB;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * The subscription-mode to scraper-mode translation.
 *
 * <p>This mapping was missing entirely for a long time, so every site was scraped as "default"
 * no matter what the user picked and nothing failed loudly. It used to live on the job row
 * ({@code ScrapeJobService}); with the queue moved to SQS it lives on the message, so the test
 * moved here with it rather than being dropped.
 */
class MessageSenderModeTest {

    @Test
    void translatesEachSubscriptionModeToItsPromptKey() {
        assertEquals("shorter", MessageSender.scrapeModeFor("a.com", "short"));
        assertEquals("default", MessageSender.scrapeModeFor("b.com", "standard"));
        assertEquals("longer",  MessageSender.scrapeModeFor("c.com", "deepDive"));
    }

    @Test
    void fallsBackToDefaultForUnknownOrMissingMode() {
        assertEquals("default", MessageSender.scrapeModeFor("d.com", ""));
        assertEquals("default", MessageSender.scrapeModeFor("e.com", null));
        assertEquals("default", MessageSender.scrapeModeFor("f.com", "someModeFromTheFuture"));
    }
}
