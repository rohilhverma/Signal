package com.rohil_verma.organization_api.Users;

import java.time.Instant;

/**
 * One subscribed source and its mute state, for {@code GET /user/sources}.
 *
 * <p>{@code mutedUntil} is null whenever the source is live, so the frontend never has to
 * compare timestamps to decide whether the mute has lapsed - a snooze that ran out reads
 * exactly like one that was never set. {@code indefinite} separates "hidden until Tuesday"
 * from "hidden until I say otherwise", which are shown differently and, in the scrape path,
 * behave differently.
 */
public record SubscriptionDTO(
    String websiteURL,
    String contentMode,
    Instant mutedUntil,
    boolean indefinite,
    int articleCount
) {}
