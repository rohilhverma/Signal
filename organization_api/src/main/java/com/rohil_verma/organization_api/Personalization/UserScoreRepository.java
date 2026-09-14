package com.rohil_verma.organization_api.Personalization;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface UserScoreRepository extends JpaRepository<UserScore, UserScoreId> {

    List<UserScore> findByUserId(Integer userId);

    /**
     * Adds {@code delta} to the existing score for (user, term), or inserts a fresh row
     * at {@code delta} if this is the first time the term has shown up for this user.
     * {@code updated_at} is stamped to now on every call — that timestamp is what the
     * read-time half-life decay in the ranking service measures age from, so it must
     * move every time new evidence for the term is written, not just on insert.
     *
     * <p>Raw accumulation only: no decay is applied here. Decay is a read-time concern.
     *
     * <p>{@code display_label} is written through {@code COALESCE} in that order deliberately:
     * a term reached by the prose-tokenizer fallback supplies null and must not blank out a
     * good label an earlier tagged article already stored, while a tagged article backfills
     * the label onto a row that has none. {@code hit_count} counts articles, so it climbs by
     * one per call regardless of how large this article's delta is.
     */
    @Modifying
    @Transactional
    @Query(value = """
        INSERT INTO user_scores (user_id, word_key, score_val, display_label, hit_count, updated_at)
        VALUES (:userId, :wordKey, :delta, :displayLabel, 1, now())
        ON CONFLICT (user_id, word_key) DO UPDATE SET
            score_val = user_scores.score_val + EXCLUDED.score_val,
            display_label = COALESCE(EXCLUDED.display_label, user_scores.display_label),
            hit_count = COALESCE(user_scores.hit_count, 0) + 1,
            updated_at = now()
        """, nativeQuery = true)
    void upsertScoreDelta(@Param("userId") Integer userId, @Param("wordKey") String wordKey,
                           @Param("delta") Integer delta,
                           @Param("displayLabel") String displayLabel);
}
