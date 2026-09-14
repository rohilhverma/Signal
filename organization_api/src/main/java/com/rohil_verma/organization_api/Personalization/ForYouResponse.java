package com.rohil_verma.organization_api.Personalization;

import java.time.Instant;
import java.util.List;

/** Response body for {@code GET /user/feed/foryou}. Shape is fixed by the frontend. */
public class ForYouResponse {

    private final Instant generatedAt;
    private final boolean enabled;
    private final List<ForYouArticle> articles;

    public ForYouResponse(Instant generatedAt, boolean enabled, List<ForYouArticle> articles) {
        this.generatedAt = generatedAt;
        this.enabled = enabled;
        this.articles = articles == null ? List.of() : articles;
    }

    public Instant getGeneratedAt() { return generatedAt; }
    public boolean isEnabled() { return enabled; }
    public List<ForYouArticle> getArticles() { return articles; }
}
