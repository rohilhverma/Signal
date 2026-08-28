package com.rohil_verma.organization_api.Articles;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.transaction.Transactional;

public interface ArticleRepository extends JpaRepository<Article, Integer> {

    /**
     * The dashboard read. One query for every site the user subscribes to, with the
     * freshness window applied in SQL rather than after the fact in Java.
     */
    List<ArticleFeedView> findByWebsiteURLInAndProcessedAtAfterOrderByProcessedAtDesc(
        Collection<String> websiteURLs, Instant cutoff);

    @Query("select a.articleText from Article a where a.link = :link")
    String findArticleTextByLink(@Param("link") String link);

    @Transactional
    @Modifying
    @Query("update Article a set a.summaryShort = :summary where a.websiteURL = :websiteURL and a.link = :link")
    int updateSummaryShort(@Param("websiteURL") String websiteURL, @Param("link") String link, @Param("summary") String summary);

    @Transactional
    @Modifying
    @Query("update Article a set a.summaryDefault = :summary where a.websiteURL = :websiteURL and a.link = :link")
    int updateSummaryDefault(@Param("websiteURL") String websiteURL, @Param("link") String link, @Param("summary") String summary);

    @Transactional
    @Modifying
    @Query("update Article a set a.summaryLong = :summary where a.websiteURL = :websiteURL and a.link = :link")
    int updateSummaryLong(@Param("websiteURL") String websiteURL, @Param("link") String link, @Param("summary") String summary);

    @Transactional
    int deleteByProcessedAtBefore(Instant cutoff);
}
