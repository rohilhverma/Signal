package com.rohil_verma.organization_api.Personalization;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Binds the {@code personalization.*} block in {@code application.properties}. That file's own
 * comments are the spec for these numbers — they are hand-set and meant to be adjusted by
 * reading the {@code explain} payload {@code /user/feed/foryou} returns, not re-derived here.
 *
 * <p>Registered by component scan (a plain {@code @Component} plus {@code @ConfigurationProperties}
 * is enough for Spring Boot's autoconfigured binding processor to pick it up — no
 * {@code @EnableConfigurationProperties} needed), so nothing about {@code OrganizationApiApplication}
 * has to change for this to bind.
 */
@Component
@ConfigurationProperties(prefix = "personalization")
public class PersonalizationProperties {

    private boolean enabled = true;
    private int windowHours = 168;
    private int feedLimit = 50;
    private int halfLifeDays = 21;
    private int serendipitySlots = 2;
    private Weight weight = new Weight();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public int getWindowHours() { return windowHours; }
    public void setWindowHours(int windowHours) { this.windowHours = windowHours; }

    public int getFeedLimit() { return feedLimit; }
    public void setFeedLimit(int feedLimit) { this.feedLimit = feedLimit; }

    public int getHalfLifeDays() { return halfLifeDays; }
    public void setHalfLifeDays(int halfLifeDays) { this.halfLifeDays = halfLifeDays; }

    public int getSerendipitySlots() { return serendipitySlots; }
    public void setSerendipitySlots(int serendipitySlots) { this.serendipitySlots = serendipitySlots; }

    public Weight getWeight() { return weight; }
    public void setWeight(Weight weight) { this.weight = weight; }

    public static class Weight {
        private double termAffinity = 1.0;
        private double sourceAffinity = 2.0;
        private double keywordBoost = 3.0;
        private double recency = 2.0;
        private double diversityPenalty = 0.5;
        private double seenPenalty = 1.5;

        public double getTermAffinity() { return termAffinity; }
        public void setTermAffinity(double termAffinity) { this.termAffinity = termAffinity; }

        public double getSourceAffinity() { return sourceAffinity; }
        public void setSourceAffinity(double sourceAffinity) { this.sourceAffinity = sourceAffinity; }

        public double getKeywordBoost() { return keywordBoost; }
        public void setKeywordBoost(double keywordBoost) { this.keywordBoost = keywordBoost; }

        public double getRecency() { return recency; }
        public void setRecency(double recency) { this.recency = recency; }

        public double getDiversityPenalty() { return diversityPenalty; }
        public void setDiversityPenalty(double diversityPenalty) { this.diversityPenalty = diversityPenalty; }

        public double getSeenPenalty() { return seenPenalty; }
        public void setSeenPenalty(double seenPenalty) { this.seenPenalty = seenPenalty; }
    }
}
