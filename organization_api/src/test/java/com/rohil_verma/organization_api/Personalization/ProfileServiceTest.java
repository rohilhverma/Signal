package com.rohil_verma.organization_api.Personalization;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.notNull;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.rohil_verma.organization_api.Articles.Article;
import com.rohil_verma.organization_api.Articles.ArticleRepository;

/**
 * No Spring context: {@link ProfileService}'s collaborators are field-injected
 * ({@code @Autowired} fields, no constructor), so they are wired in here with
 * {@link ReflectionTestUtils} rather than an ApplicationContext.
 */
class ProfileServiceTest {

    private final ArticleRepository articleRepository = mock(ArticleRepository.class);
    private final UserScoreRepository userScoreRepository = mock(UserScoreRepository.class);
    private final ProfileService profileService = new ProfileService();

    @BeforeEach
    void wireCollaborators() {
        ReflectionTestUtils.setField(profileService, "articleRepository", articleRepository);
        ReflectionTestUtils.setField(profileService, "userScoreRepository", userScoreRepository);
        // The real extractor, not a stub: the topics-vs-tokens preference under test
        // lives inside TermExtractorImpl, so a mock would just assert the mock's own
        // stubbing instead of exercising it.
        ReflectionTestUtils.setField(profileService, "termExtractor", new TermExtractorImpl());
    }

    @Test
    void skipsAMissingArticleWithoutThrowing() {
        when(articleRepository.findFirstByLink("https://gone.example/a")).thenReturn(Optional.empty());

        assertDoesNotThrow(() ->
            profileService.applyActivity(1, Map.of("https://gone.example/a", 5)));

        verify(userScoreRepository, never()).upsertScoreDelta(anyInt(), any(), anyInt(), any());
    }

    @Test
    void doesNotTouchArticleRepositoryForEmptyOrNonPositiveActivity() {
        profileService.applyActivity(1, null);
        profileService.applyActivity(1, Map.of("https://example.com/a", 0));
        profileService.applyActivity(1, Map.of("https://example.com/b", -3));

        verifyNoInteractions(articleRepository);
    }

    @Test
    void prefersTopicsTagsOverTokenizedProseWhenTopicsPresent() {
        Article article = new Article();
        article.setTitle("Some headline about chips");
        article.setSummaryDefault("A summary that never mentions the tagged phrase at all.");
        article.setTopics("Quantum Widgets, Nvidia");
        when(articleRepository.findFirstByLink("https://example.com/a")).thenReturn(Optional.of(article));

        profileService.applyActivity(7, Map.of("https://example.com/a", 4));

        // "quantum widget" is the normalized tag key and appears nowhere in the title or
        // summary prose, so its presence here proves the topics path won, not the
        // tokenizer fallback which could never have produced it.
        verify(userScoreRepository).upsertScoreDelta(eq(7), eq("quantum widget"), anyInt(), any());
        verify(userScoreRepository).upsertScoreDelta(eq(7), eq("nvidia"), anyInt(), any());
    }

    @Test
    void storesTheRawTagAsTheDisplayLabelForTheNormalizedKey() {
        Article article = new Article();
        article.setTopics("Quantum Widgets, Nvidia");
        when(articleRepository.findFirstByLink("https://example.com/a")).thenReturn(Optional.of(article));

        profileService.applyActivity(7, Map.of("https://example.com/a", 4));

        // The key is lowercased and singularized; the label keeps the casing a person reads.
        verify(userScoreRepository)
            .upsertScoreDelta(eq(7), eq("quantum widget"), anyInt(), eq("Quantum Widgets"));
        verify(userScoreRepository)
            .upsertScoreDelta(eq(7), eq("nvidia"), anyInt(), eq("Nvidia"));
    }

    @Test
    void writesANullLabelForTermsThatCameFromProseRatherThanTags() {
        Article article = new Article();
        article.setTitle("Nvidia ships a new accelerator");
        article.setSummaryDefault("Nvidia said the accelerator ships in spring.");
        article.setTopics(null);
        when(articleRepository.findFirstByLink("https://example.com/a")).thenReturn(Optional.of(article));

        profileService.applyActivity(7, Map.of("https://example.com/a", 4));

        // No tags to take casing from, so every write must pass null and let the upsert's
        // COALESCE leave any previously stored label alone.
        verify(userScoreRepository, atLeastOnce())
            .upsertScoreDelta(anyInt(), any(), anyInt(), isNull());
        verify(userScoreRepository, never())
            .upsertScoreDelta(anyInt(), any(), anyInt(), notNull());
    }

    // ─── Read side ────────────────────────────────────────────────────────────

    @Test
    void topTopicsIsEmptyForAProfileWithNoScores() {
        when(userScoreRepository.findByUserId(1)).thenReturn(List.of());

        assertTrue(profileService.topTopics(1, 8).isEmpty());
    }

    /**
     * With no {@link PersonalizationProperties} wired (as here), half-life is 0 and decay is
     * skipped, so this pins the ordering and the cap rather than the decay curve — the decay
     * formula itself is {@code PersonalizationService.decay}, covered in its own test.
     */
    @Test
    void topTopicsRanksByScoreDescendingAndHonoursTheLimit() {
        when(userScoreRepository.findByUserId(1)).thenReturn(List.of(
            score("nvidia", 5, "Nvidia"),
            score("openai", 40, "OpenAI"),
            score("fed rate", 12, "Fed Rates")));

        List<ProfileService.TopicAffinity> top = profileService.topTopics(1, 2);

        assertEquals(2, top.size());
        assertEquals("OpenAI", top.get(0).label());
        assertEquals("Fed Rates", top.get(1).label());
    }

    @Test
    void topTopicsFallsBackToATitleCasedKeyWhenNoLabelWasStored() {
        when(userScoreRepository.findByUserId(1)).thenReturn(List.of(
            score("quantum widget", 5, null)));

        assertEquals("Quantum Widget", profileService.topTopics(1, 8).get(0).label());
    }

    @Test
    void topTopicsReportsAMissingHitCountAsZeroRatherThanFailing() {
        UserScore legacyRow = score("nvidia", 5, "Nvidia");
        legacyRow.setHitCount(null);
        when(userScoreRepository.findByUserId(1)).thenReturn(List.of(legacyRow));

        assertEquals(0, profileService.topTopics(1, 8).get(0).articleCount());
    }

    private static UserScore score(String wordKey, int scoreVal, String label) {
        UserScore s = new UserScore(1, wordKey, scoreVal, Instant.now());
        s.setDisplayLabel(label);
        s.setHitCount(1);
        return s;
    }

    @Test
    void earlierRankedTermsGetALargerDeltaThanLaterOnes() {
        Article article = new Article();
        article.setTopics("Nvidia, OpenAI");
        when(articleRepository.findFirstByLink("https://example.com/a")).thenReturn(Optional.of(article));

        profileService.applyActivity(1, Map.of("https://example.com/a", 100));

        var firstDelta = org.mockito.ArgumentCaptor.forClass(Integer.class);
        var secondDelta = org.mockito.ArgumentCaptor.forClass(Integer.class);
        verify(userScoreRepository).upsertScoreDelta(eq(1), eq("nvidia"), firstDelta.capture(), any());
        verify(userScoreRepository).upsertScoreDelta(eq(1), eq("openai"), secondDelta.capture(), any());

        assertTrue(firstDelta.getValue() > secondDelta.getValue());
    }
}
