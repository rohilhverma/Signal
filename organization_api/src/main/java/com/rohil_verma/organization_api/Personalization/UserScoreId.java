package com.rohil_verma.organization_api.Personalization;

import java.io.Serializable;
import java.util.Objects;

/** Composite key for {@link UserScore}: the profile is one row per (user, term). */
public class UserScoreId implements Serializable {
    private Integer userId;
    private String wordKey;

    public UserScoreId() {}

    public UserScoreId(Integer userId, String wordKey) {
        this.userId = userId;
        this.wordKey = wordKey;
    }

    public Integer getUserId() { return userId; }
    public String getWordKey() { return wordKey; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserScoreId other)) return false;
        return Objects.equals(userId, other.userId) && Objects.equals(wordKey, other.wordKey);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, wordKey); }
}
