package com.rohil_verma.organization_api;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;

import com.rohil_verma.organization_api.Users.User;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One row per (user, article): a snapshot of the cumulative interaction score for that
 * article, not an event log. The client sends the running total on every flush, so a
 * second row for the same pair is a duplicate, not new evidence — the unique constraint
 * plus {@link com.rohil_verma.organization_api.Users.UserActivityRepository#upsertActivity}
 * is what keeps that true in the database as well as in intent. See
 * {@link com.rohil_verma.organization_api.Users.UserActivityDedupRunner} for the one-off
 * cleanup this constraint required when it was added to a table that already had
 * duplicate rows.
 */
@Entity
@Table(
    name = "user_activity",
    uniqueConstraints = @UniqueConstraint(name = "uk_user_activity_user_link", columnNames = {"user_id", "article_link"})
)
public class UserActivity {
    @Id
    @GeneratedValue(strategy=GenerationType.IDENTITY)
    private Integer id;

    // Matches articles.link (varchar(2048)): a long article URL must not throw here and
    // silently drop the whole activity flush batch.
    @Column(name = "article_link", length = 2048)
    private String articleLink;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name="user_id")
    private User user;

    private Integer score;

    @CreationTimestamp()
    private Instant createdAt;

    public UserActivity(){}

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getArticleLink() {
        return articleLink;
    }

    public void setArticleLink(String articleLink) {
        this.articleLink = articleLink;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Integer getScore() {
        return score;
    }

    public void setScore(Integer score) {
        this.score = score;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public String toString() {
        return user.toString() + articleLink + score.toString();
    }
}
