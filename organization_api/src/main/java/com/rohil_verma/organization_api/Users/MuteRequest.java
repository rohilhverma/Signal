package com.rohil_verma.organization_api.Users;

/**
 * Body for the mute endpoints. A null or absent {@code days} means no end date - which is
 * also the form that stops the nightly scrape, so the two ways of hiding a source are one
 * field apart rather than two endpoints.
 */
public record MuteRequest(String websiteURL, Integer days) {}
