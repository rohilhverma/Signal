package com.rohil_verma.organization_api.Personalization;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.rohil_verma.organization_api.Personalization.PersonalizationService.Candidate;
import com.rohil_verma.organization_api.Personalization.PersonalizationService.RankedCandidate;
import com.rohil_verma.organization_api.Personalization.PersonalizationService.ScoredCandidate;

/**
 * Plain JUnit, no Spring context — style of {@code Jobs.ScrapeJobModeTest}. Exercises the
 * static scoring pipeline directly rather than the {@code @Service} instance, since that
 * instance only adds repository wiring around these functions.
 */
class PersonalizationServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-28T12:00:00Z");

    // ─── half-life decay ───────────────────────────────────────────────────

    @Test
    void twentyOneDayOldScoreIsRoughlyHalved() {
        double effective = PersonalizationService.decay(100.0, NOW.minus(21, ChronoUnit.DAYS), NOW, 21);
        assertEquals(50.0, effective, 0.5);
    }

    @Test
    void freshScoreIsBarelyDecayed() {
        double effective = PersonalizationService.decay(100.0, NOW.minus(1, ChronoUnit.HOURS), NOW, 21);
        assertTrue(effective > 99.0, "an hour-old score should be almost undecayed, was " + effective);
    }

    @Test
    void doubleTheHalfLifeQuartersTheScore() {
        double effective = PersonalizationService.decay(100.0, NOW.minus(42, ChronoUnit.DAYS), NOW, 21);
        assertEquals(25.0, effective, 0.5);
    }

    // ─── cold / empty profile ──────────────────────────────────────────────

    @Test
    void coldEmptyProfileStillProducesAFullFeed() {
        List<Candidate> candidates = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            candidates.add(candidate("link" + i, "www.example.com", NOW.minus(i, ChronoUnit.HOURS),
                List.of("term" + i, "other" + i)));
        }

        PersonalizationProperties props = new PersonalizationProperties();
        Map<String, Double> emptyProfile = Map.of();
        Map<String, Double> emptySourceAffinity = Map.of();
        Set<String> emptyKeywords = Set.of();
        Set<String> emptyEngaged = Set.of();

        List<ScoredCandidate> scored = new ArrayList<>();
        for (Candidate c : candidates) {
            scored.add(PersonalizationService.scoreCandidate(
                c, emptyProfile, emptySourceAffinity, emptyKeywords, emptyEngaged, null, NOW, props));
        }

        List<RankedCandidate> ranked = PersonalizationService.rank(
            scored, props.getFeedLimit(), props.getSerendipitySlots(), props.getWeight().getDiversityPenalty());

        assertEquals(5, ranked.size(), "an empty profile must still rank every candidate, not zero out the feed");
        for (RankedCandidate rc : ranked) {
            assertFalse(Double.isNaN(rc.score()), "score must never be NaN for a cold profile");
        }
    }

    // ─── diversity penalty ─────────────────────────────────────────────────

    @Test
    void diversityPenaltyDemotesRepeatsOfTheSameTopTerm() {
        // A, B, C all lead with "nvidia"; D leads with "apple". Diversity weight is 1.0 so the
        // math is easy to hand-check: each additional "nvidia" article already placed costs the
        // next one exactly 1.0.
        ScoredCandidate a = scored("a", "nvidia", 10.0);
        ScoredCandidate b = scored("b", "nvidia", 9.0);
        ScoredCandidate c = scored("c", "nvidia", 8.0);
        ScoredCandidate d = scored("d", "apple", 7.0);

        List<RankedCandidate> ranked = PersonalizationService.rank(
            List.of(a, b, c, d), 4, 0, 1.0);

        assertEquals(4, ranked.size());
        assertEquals("a", ranked.get(0).candidate().link());
        assertEquals(0.0, ranked.get(0).explain().getDiversityPenalty(), 1e-9);

        assertEquals("b", ranked.get(1).candidate().link());
        assertEquals(-1.0, ranked.get(1).explain().getDiversityPenalty(), 1e-9);

        // d (apple, raw 7) overtakes c (nvidia, raw 8 but penalised -2.0 = adjusted 6) because
        // the penalty is recomputed and re-sorted at every step, not applied once up front.
        assertEquals("d", ranked.get(2).candidate().link());
        assertEquals(0.0, ranked.get(2).explain().getDiversityPenalty(), 1e-9);

        assertEquals("c", ranked.get(3).candidate().link());
        assertEquals(-2.0, ranked.get(3).explain().getDiversityPenalty(), 1e-9);
    }

    // ─── serendipity slots ─────────────────────────────────────────────────

    @Test
    void serendipitySlotsAreActuallyFilled() {
        List<ScoredCandidate> pool = new ArrayList<>();
        // Four strong, high-affinity candidates -- these should take the normal slots.
        for (int i = 0; i < 4; i++) {
            pool.add(new ScoredCandidate(
                candidate("strong" + i, "site.com", NOW, List.of("t" + i)),
                20.0 - i, 15.0, 2.0, 1.0, 2.0, 0.0, "t" + i, List.of("t" + i), false));
        }
        // Two low-affinity, high-recency candidates -- these should be the serendipity picks.
        for (int i = 0; i < 2; i++) {
            pool.add(new ScoredCandidate(
                candidate("fresh" + i, "site.com", NOW, List.of("u" + i)),
                1.0, 0.0, 0.0, 0.0, 1.0, 0.0, "u" + i, List.of("u" + i), true));
        }

        List<RankedCandidate> ranked = PersonalizationService.rank(pool, 6, 2, 0.5);

        assertEquals(6, ranked.size());
        long serendipityCount = ranked.stream().filter(rc -> rc.explain().isSerendipity()).count();
        assertEquals(2, serendipityCount, "both reserved serendipity slots must be filled");

        Set<String> serendipityLinks = new HashSet<>();
        for (RankedCandidate rc : ranked) {
            if (rc.explain().isSerendipity()) {
                serendipityLinks.add(rc.candidate().link());
            }
        }
        assertEquals(Set.of("fresh0", "fresh1"), serendipityLinks,
            "serendipity picks should come from the low-affinity pool, not steal a normal slot");
    }

    // ─── enabled=false fallback ────────────────────────────────────────────

    @Test
    void disabledFallsBackToPlainRecencyOrder() {
        List<Candidate> candidates = List.of(
            candidate("old", "site.com", NOW.minus(3, ChronoUnit.HOURS), List.of("x")),
            candidate("new", "site.com", NOW, List.of("y")),
            candidate("mid", "site.com", NOW.minus(1, ChronoUnit.HOURS), List.of("z")));

        List<RankedCandidate> ranked = PersonalizationService.recencyFallback(candidates, 10);

        assertEquals(List.of("new", "mid", "old"),
            ranked.stream().map(rc -> rc.candidate().link()).toList());
        for (RankedCandidate rc : ranked) {
            assertEquals(0.0, rc.score());
            assertFalse(rc.explain().isSerendipity());
        }
    }

    // ─── explain internal consistency ─────────────────────────────────────

    @Test
    void explainComponentsSumToTheReportedScore() {
        Map<String, Double> profile = new HashMap<>();
        profile.put("nvidia", 12.0);
        profile.put("gpu", 4.0);
        Map<String, Double> sourceAffinity = Map.of("site.com", 6.0);
        Set<String> keywords = PersonalizationService.normalizedKeywords(List.of("Nvidia"));

        Candidate c = candidate("link", "site.com", NOW.minus(2, ChronoUnit.HOURS), List.of("nvidia", "gpu"));
        PersonalizationProperties props = new PersonalizationProperties();

        ScoredCandidate sc = PersonalizationService.scoreCandidate(
            c, profile, sourceAffinity, keywords, Set.of(), null, NOW, props);

        List<RankedCandidate> ranked = PersonalizationService.rank(List.of(sc), 1, 0, 0.5);
        RankedCandidate rc = ranked.get(0);

        assertEquals(rc.explain().total(), rc.score(), 1e-9,
            "the sum of the six explain components must equal the reported score exactly");
    }

    // ─── smaller unit checks on the approximations ─────────────────────────

    @Test
    void keywordMatchFractionMatchesOnNormalizedTermOrRawSubstring() {
        Set<String> keywords = PersonalizationService.normalizedKeywords(List.of("Chips", "Quantum Computing"));
        double fraction = PersonalizationService.keywordMatchFraction(
            List.of("chip"), "Nvidia ships new chips", "unrelated summary text", keywords);
        // "chip"/"chips" normalizes and matches the extracted term; "quantum computing" matches
        // neither the term set nor the raw text, so exactly one of the two keywords hits.
        assertEquals(0.5, fraction, 1e-9);
    }

    @Test
    void seenPenaltyOnlyAppliesAfterMinimumAgeAndSomeLaterActivity() {
        Instant processedAt = NOW.minus(10, ChronoUnit.HOURS);
        Instant laterActivity = NOW.minus(1, ChronoUnit.HOURS);

        assertTrue(PersonalizationService.approximatelySeen(
            processedAt, NOW, laterActivity, false, PersonalizationService.SEEN_MIN_AGE_HOURS));

        // Too fresh -- not old enough to assume the user had a chance to see it.
        assertFalse(PersonalizationService.approximatelySeen(
            NOW.minus(1, ChronoUnit.HOURS), NOW, laterActivity, false, PersonalizationService.SEEN_MIN_AGE_HOURS));

        // The user did engage with this exact article -- never "seen and ignored".
        assertFalse(PersonalizationService.approximatelySeen(
            processedAt, NOW, laterActivity, true, PersonalizationService.SEEN_MIN_AGE_HOURS));

        // No activity at all since -- can't infer the user was ever around to see it.
        assertFalse(PersonalizationService.approximatelySeen(
            processedAt, NOW, null, false, PersonalizationService.SEEN_MIN_AGE_HOURS));
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    private static Candidate candidate(String link, String site, Instant processedAt, List<String> terms) {
        return new Candidate(link, site, "Title for " + link, "", "summary " + link, "",
            "Fri, 28 Aug 2026 10:00:00 GMT", processedAt, 500, List.of(), terms);
    }

    private static ScoredCandidate scored(String link, String topTerm, double baseScore) {
        return new ScoredCandidate(
            candidate(link, "site.com", NOW, List.of(topTerm)),
            baseScore, baseScore, 0.0, 0.0, 0.0, 0.0, topTerm, List.of(topTerm), false);
    }
}
