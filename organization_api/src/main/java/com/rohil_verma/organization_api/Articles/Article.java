package com.rohil_verma.organization_api.Articles;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "articles",
    uniqueConstraints = @UniqueConstraint(name = "uk_articles_site_link", columnNames = {"website_url", "link"}),
    indexes = @Index(name = "idx_articles_site_processed", columnList = "website_url, processed_at")
)
public class Article {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "website_url", nullable = false)
    private String websiteURL;

    @Column(name = "link", nullable = false, length = 2048)
    private String link;

    @Column(name = "title", columnDefinition = "text")
    private String title;

    @Column(name = "summary_short", columnDefinition = "text")
    private String summaryShort;

    @Column(name = "summary_default", columnDefinition = "text")
    private String summaryDefault;

    @Column(name = "summary_long", columnDefinition = "text")
    private String summaryLong;

    @Column(name = "article_text", columnDefinition = "text")
    private String articleText;

    @Column(name = "word_count")
    private Integer wordCount;

    // Kept as text: the feed supplies this string and the frontend renders it verbatim.
    @Column(name = "published_at")
    private String publishedAt;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;

    @Column(name = "paywall")
    private Boolean paywall;

    // Entity tags emitted by the summarizer alongside the summary, comma-joined. The
    // personalization profile prefers these over tokenized title/summary text: they are
    // real entities rather than frequent words. Null for anything scraped before tagging
    // shipped, which is what TermExtractor's fallback path exists to cover.
    @Column(name = "topics", columnDefinition = "text")
    private String topics;

    public Article(){}

    public String getTopics(){return topics;}

    public void setTopics(String topics){this.topics = topics;}

    public Integer getId() {return id;}

    public void setId(Integer id){this.id = id;}

    public String getWebsiteURL(){return websiteURL;}

    public void setWebsiteURL(String websiteURL){this.websiteURL = websiteURL;}

    public String getLink(){return link;}

    public void setLink(String link){this.link = link;}

    public String getTitle(){return title;}

    public void setTitle(String title){this.title = title;}

    public String getSummaryShort(){return summaryShort;}

    public void setSummaryShort(String summaryShort){this.summaryShort = summaryShort;}

    public String getSummaryDefault(){return summaryDefault;}

    public void setSummaryDefault(String summaryDefault){this.summaryDefault = summaryDefault;}

    public String getSummaryLong(){return summaryLong;}

    public void setSummaryLong(String summaryLong){this.summaryLong = summaryLong;}

    public String getArticleText(){return articleText;}

    public void setArticleText(String articleText){this.articleText = articleText;}

    public Integer getWordCount(){return wordCount;}

    public void setWordCount(Integer wordCount){this.wordCount = wordCount;}

    public String getPublishedAt(){return publishedAt;}

    public void setPublishedAt(String publishedAt){this.publishedAt = publishedAt;}

    public Instant getProcessedAt(){return processedAt;}

    public void setProcessedAt(Instant processedAt){this.processedAt = processedAt;}

    public Boolean getPaywall(){return paywall;}

    public void setPaywall(Boolean paywall){this.paywall = paywall;}

    @Override
    public String toString() {
        return "Article [websiteURL=" + websiteURL + ", link=" + link + "]";
    }
}
