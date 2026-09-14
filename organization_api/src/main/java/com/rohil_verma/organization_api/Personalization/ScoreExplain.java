package com.rohil_verma.organization_api.Personalization;

import java.util.List;

/**
 * First-class, not a debug flag: with one user and ~44 articles this explain payload is the
 * only tuning loop that exists for {@code personalization.weight.*}, and the frontend renders
 * it as "why you're seeing this" chips.
 *
 * <p>Every numeric field already carries the sign it contributes to the candidate's final
 * score — {@code diversityPenalty} and {@code seenPenalty} are zero or negative, everything
 * else is zero or positive. Summing all six reproduces the reported score exactly; see
 * {@link #total()}.
 */
public class ScoreExplain {

    private final double termAffinity;
    private final double sourceAffinity;
    private final double keywordBoost;
    private final double recency;
    private final double diversityPenalty;
    private final double seenPenalty;
    private final boolean serendipity;
    private final List<String> topTerms;

    public ScoreExplain(double termAffinity, double sourceAffinity, double keywordBoost,
                         double recency, double diversityPenalty, double seenPenalty,
                         boolean serendipity, List<String> topTerms) {
        this.termAffinity = termAffinity;
        this.sourceAffinity = sourceAffinity;
        this.keywordBoost = keywordBoost;
        this.recency = recency;
        this.diversityPenalty = diversityPenalty;
        this.seenPenalty = seenPenalty;
        this.serendipity = serendipity;
        this.topTerms = topTerms == null ? List.of() : topTerms;
    }

    public double getTermAffinity() { return termAffinity; }
    public double getSourceAffinity() { return sourceAffinity; }
    public double getKeywordBoost() { return keywordBoost; }
    public double getRecency() { return recency; }
    public double getDiversityPenalty() { return diversityPenalty; }
    public double getSeenPenalty() { return seenPenalty; }
    public boolean isSerendipity() { return serendipity; }
    public List<String> getTopTerms() { return topTerms; }

    /** Sum of the six components. Must equal the candidate's reported {@code score}. */
    public double total() {
        return termAffinity + sourceAffinity + keywordBoost + recency + diversityPenalty + seenPenalty;
    }
}
