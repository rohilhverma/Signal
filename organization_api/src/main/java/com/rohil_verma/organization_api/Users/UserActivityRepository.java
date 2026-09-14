package com.rohil_verma.organization_api.Users;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.rohil_verma.organization_api.UserActivity;

@Repository
public interface UserActivityRepository extends JpaRepository<UserActivity, Integer> {
    List<UserActivity> findByUser(User user);

    /**
     * Upsert on (user_id, article_link). The client always sends the cumulative,
     * monotonically increasing score for an article, so the correct merge on a duplicate
     * flush (pagehide + visibilitychange firing for the same navigation, a retried
     * request, etc.) is the maximum of the two scores, never a blind overwrite. Native
     * query because JPQL has no ON CONFLICT.
     */
    @Modifying
    @Transactional
    @Query(value = """
        INSERT INTO user_activity (user_id, article_link, score, created_at)
        VALUES (:userId, :articleLink, :score, now())
        ON CONFLICT (user_id, article_link) DO UPDATE SET
            score = GREATEST(user_activity.score, EXCLUDED.score),
            created_at = EXCLUDED.created_at
        """, nativeQuery = true)
    void upsertActivity(@Param("userId") Integer userId, @Param("articleLink") String articleLink,
                         @Param("score") Integer score);

    /**
     * One-off cleanup for rows written before the (user_id, article_link) unique
     * constraint existed, when every flush inserted a fresh row instead of upserting.
     * Collapses each duplicate group down to the single row with the highest score
     * (ties broken by newest created_at, then highest id), which is the same merge rule
     * {@link #upsertActivity} applies going forward. Safe to run repeatedly: once there
     * are no duplicates left, every group has exactly one row and nothing is deleted.
     */
    /**
     * Engaged-article counts grouped by source. Joins to {@code articles} by link rather
     * than storing website_url on user_activity directly, because that would go stale the
     * moment {@link com.rohil_verma.organization_api.Articles.ArticleRetention} purges the
     * article row - a source breakdown has to survive the article it was earned on being
     * deleted, so it is computed fresh from whatever is still resolvable and silently
     * excludes links whose article has already been swept.
     */
    @Query(value = """
        SELECT a.website_url AS websiteUrl, COUNT(*) AS articleCount
        FROM user_activity ua
        JOIN articles a ON a.link = ua.article_link
        WHERE ua.user_id = :userId
        GROUP BY a.website_url
        ORDER BY articleCount DESC
        """, nativeQuery = true)
    List<SourceCount> countByUserGroupedBySource(@Param("userId") Integer userId);

    interface SourceCount {
        String getWebsiteUrl();
        Long getArticleCount();
    }

    @Modifying
    @Transactional
    @Query(value = """
        DELETE FROM user_activity
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY user_id, article_link
                           ORDER BY score DESC, created_at DESC, id DESC
                       ) AS rn
                FROM user_activity
            ) ranked
            WHERE ranked.rn > 1
        )
        """, nativeQuery = true)
    int dedupeKeepingMaxScore();
}
