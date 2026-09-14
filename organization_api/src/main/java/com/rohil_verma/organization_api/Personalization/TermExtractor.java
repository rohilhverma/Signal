package com.rohil_verma.organization_api.Personalization;

import java.util.List;

/**
 * Turns one article into the normalised term keys that represent it, for both halves of
 * personalization: building the profile when a user interacts with an article, and scoring a
 * candidate article against that profile.
 *
 * <p>Both halves must use this same implementation. If the profile is built from one
 * vocabulary and candidates are scored in another, nothing ever matches.
 */
public interface TermExtractor {

    /**
     * @param title   article title, may be null
     * @param summary summary prose — pass {@code summaryDefault}, the only mode reliably
     *                populated; short and long are null until a user asks for them
     * @param topics  comma-joined tags from {@code articles.topics}, may be null or blank for
     *                anything scraped before tagging shipped
     * @return distinct normalised term keys, lowercase, most significant first. Empty, never
     *         null, when there is nothing usable.
     */
    List<String> extract(String title, String summary, String topics);
}
