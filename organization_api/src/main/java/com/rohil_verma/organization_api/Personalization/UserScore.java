package com.rohil_verma.organization_api.Personalization;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * One term of one user's affinity profile.
 *
 * <p>The table predates this class: {@code user_scores(user_id, word_key, score_val)} was
 * already in Postgres, empty and mapped by nothing. The shape is kept; {@code updated_at} is
 * added because affinity decays with a half-life applied at read time, which needs to know
 * how old the evidence is.
 *
 * <p>Decay is deliberately not a scheduled rewrite. A nightly "age every score" job is one
 * more thing that falls behind while the laptop sleeps — the same failure mode that moved
 * scrape enqueue out to launchd. Computing it from {@code updatedAt} on read is exact
 * regardless of how long the machine was off.
 */
@Entity
@Table(name = "user_scores")
@IdClass(UserScoreId.class)
public class UserScore {

    @Id
    @Column(name = "user_id", nullable = false)
    private Integer userId;

    /** Normalised term key, as produced by {@link TermExtractor}. Never a display form. */
    @Id
    @Column(name = "word_key", nullable = false, length = 255)
    private String wordKey;

    @Column(name = "score_val")
    private Integer scoreVal;

    /**
     * The term as a person should read it — the raw summarizer tag ("OpenAI", "Fed Rates")
     * before {@link TermExtractorImpl#normalizeKey} lowercased and singularized it.
     *
     * <p>Null for any term that came from the prose-tokenizer fallback rather than an
     * {@code articles.topics} tag, and for every row written before this column existed.
     * Readers must fall back to deriving something presentable from {@link #wordKey}:
     * title-casing the key turns "openai" into "Openai", which is why the original casing
     * is worth storing when it is available.
     */
    @Column(name = "display_label", length = 255)
    private String displayLabel;

    /**
     * How many articles have contributed to this term. Distinct from {@link #scoreVal},
     * which is weighted by interaction strength and the term's rank within each article —
     * a count is the number the Stats page can put in front of a person, where a raw
     * affinity score would mean nothing.
     *
     * <p>Null on rows written before this column existed; treat as 0.
     */
    @Column(name = "hit_count")
    private Integer hitCount;

    @Column(name = "updated_at")
    private Instant updatedAt;

    public UserScore() {}

    public UserScore(Integer userId, String wordKey, Integer scoreVal, Instant updatedAt) {
        this.userId = userId;
        this.wordKey = wordKey;
        this.scoreVal = scoreVal;
        this.updatedAt = updatedAt;
    }

    public Integer getUserId() { return userId; }
    public void setUserId(Integer userId) { this.userId = userId; }

    public String getWordKey() { return wordKey; }
    public void setWordKey(String wordKey) { this.wordKey = wordKey; }

    public Integer getScoreVal() { return scoreVal; }
    public void setScoreVal(Integer scoreVal) { this.scoreVal = scoreVal; }

    public String getDisplayLabel() { return displayLabel; }
    public void setDisplayLabel(String displayLabel) { this.displayLabel = displayLabel; }

    public Integer getHitCount() { return hitCount; }
    public void setHitCount(Integer hitCount) { this.hitCount = hitCount; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
