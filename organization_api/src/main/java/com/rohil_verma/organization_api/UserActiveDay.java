package com.rohil_verma.organization_api;

import java.time.LocalDate;

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
 * One row per (user, calendar day) on which the user engaged with at least one article.
 * This is deliberately a SEPARATE table from {@link UserActivity}, not a query derived
 * from it, because {@code user_activity.created_at} cannot answer "which days was this
 * user active" - it is overwritten to the latest touch on every score bump (see
 * {@link com.rohil_verma.organization_api.Users.UserActivityRepository#upsertActivity}),
 * so a day where the only thing read was an already-touched article leaves no trace: the
 * one row for that article jumps straight to today, and the earlier day disappears from
 * the table entirely. A streak computed from that column would silently undercount.
 * This table exists to give "was the user active on day D" an answer that doesn't decay.
 */
@Entity
@Table(
    name = "user_active_days",
    uniqueConstraints = @UniqueConstraint(name = "uk_user_active_day", columnNames = {"user_id", "activity_date"})
)
public class UserActiveDay {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "activity_date", nullable = false)
    private LocalDate activityDate;

    public UserActiveDay() {}

    public Integer getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public LocalDate getActivityDate() {
        return activityDate;
    }

    public void setActivityDate(LocalDate activityDate) {
        this.activityDate = activityDate;
    }
}
