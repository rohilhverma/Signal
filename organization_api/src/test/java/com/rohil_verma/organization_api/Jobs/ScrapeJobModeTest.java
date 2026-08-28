package com.rohil_verma.organization_api.Jobs;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * The subscription-mode to scraper-mode translation. This mapping was missing entirely
 * for a long time, so every site was scraped as "default" no matter what the user picked.
 */
class ScrapeJobModeTest {

    @Test
    void translatesEachSubscriptionModeToItsPromptKey() {
        assertEquals("shorter", ScrapeJobService.scrapeModeFor("a.com", "short"));
        assertEquals("default", ScrapeJobService.scrapeModeFor("b.com", "standard"));
        assertEquals("longer",  ScrapeJobService.scrapeModeFor("c.com", "deepDive"));
    }

    @Test
    void fallsBackToDefaultForUnknownOrMissingMode() {
        assertEquals("default", ScrapeJobService.scrapeModeFor("d.com", ""));
        assertEquals("default", ScrapeJobService.scrapeModeFor("e.com", null));
        assertEquals("default", ScrapeJobService.scrapeModeFor("f.com", "someModeFromTheFuture"));
    }
}
