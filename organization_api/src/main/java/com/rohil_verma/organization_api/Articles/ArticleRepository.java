package com.rohil_verma.organization_api.Articles;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.transaction.Transactional;

public interface ArticleRepository extends JpaRepository<Article, Integer> {

    /**
     * The dashboard read. One query for every site the user subscribes to, with the
     * freshness window applied in SQL rather than after the fact in Java.
     */
    List<ArticleFeedView> findByWebsiteURLInAndProcessedAtAfterOrderByProcessedAtDesc(
        Collection<String> websiteURLs, Instant cutoff);

    /**
     * Search over whatever {@link com.rohil_verma.organization_api.Articles.ArticleRetention}
     * hasn't purged yet - title and summary only, not article_text. This is deliberately
     * NOT "search the archive": everything older than 7 days is already gone by the time a
     * query could reach it, so the result set is bounded to the same window the dashboard
     * itself reads from, scoped to the sites the user actually subscribes to.
     *
     * No explicit cutoff parameter: retention already enforces one, and adding a second,
     * independently-drifting cutoff here would be a second place to keep in sync with it.
     *
     * {@code ILIKE '%term%'} rather than a full-text index - at "however many articles fit
     * in 7 days for a handful of subscribed sites," a sequential scan is not a real cost,
     * and it needs no separate index to keep in sync.
     */
    @Query(value = """
        SELECT
            a.website_url    AS websiteURL,
            a.link            AS link,
            a.title           AS title,
            a.summary_short   AS summaryShort,
            a.summary_default AS summaryDefault,
            a.summary_long    AS summaryLong,
            a.word_count      AS wordCount,
            a.published_at    AS publishedAt,
            a.processed_at    AS processedAt,
            a.topics          AS topics
        FROM articles a
        WHERE a.website_url IN (:websiteURLs)
          AND (a.title ILIKE CONCAT('%', :term, '%') OR a.summary_default ILIKE CONCAT('%', :term, '%'))
        ORDER BY a.processed_at DESC
        LIMIT 50
        """, nativeQuery = true)
    List<ArticleFeedView> searchByWebsiteURLs(@Param("websiteURLs") Collection<String> websiteURLs, @Param("term") String term);

    /**
     * Article counts per site over the dashboard's freshness window, for the sources screen.
     *
     * <p>Deliberately not filtered by mute state. A muted source is hidden, not empty, and
     * reporting it as "No articles yet" would misdescribe why it is missing from the feed.
     */
    @Query("""
        select a.websiteURL, count(a)
        from Article a
        where a.websiteURL in :websiteURLs and a.processedAt > :cutoff
        group by a.websiteURL
        """)
    List<Object[]> countByWebsiteURLSince(
        @Param("websiteURLs") Collection<String> websiteURLs, @Param("cutoff") Instant cutoff);

    @Query("select a.articleText from Article a where a.link = :link")
    String findArticleTextByLink(@Param("link") String link);

    /**
     * Looks the article up by link alone (not (website_url, link), the actual unique
     * key) because callers building the personalization profile from a user_activity
     * row only ever have the link. Used while the article row still exists — see
     * {@code Personalization.ProfileService}, which is why this must resolve promptly
     * before {@code ArticleRetention} sweeps the row.
     */
    Optional<Article> findFirstByLink(String link);

    @Transactional
    @Modifying
    @Query("update Article a set a.summaryShort = :summary where a.websiteURL = :websiteURL and a.link = :link")
    int updateSummaryShort(@Param("websiteURL") String websiteURL, @Param("link") String link, @Param("summary") String summary);

    @Transactional
    @Modifying
    @Query("update Article a set a.summaryDefault = :summary where a.websiteURL = :websiteURL and a.link = :link")
    int updateSummaryDefault(@Param("websiteURL") String websiteURL, @Param("link") String link, @Param("summary") String summary);

    @Transactional
    @Modifying
    @Query("update Article a set a.summaryLong = :summary where a.websiteURL = :websiteURL and a.link = :link")
    int updateSummaryLong(@Param("websiteURL") String websiteURL, @Param("link") String link, @Param("summary") String summary);

    @Transactional
    int deleteByProcessedAtBefore(Instant cutoff);
}
