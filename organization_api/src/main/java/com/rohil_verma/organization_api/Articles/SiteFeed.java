package com.rohil_verma.organization_api.Articles;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Replaces the SK="RSS" row of the old single-table design: one row per site,
 * holding the discovered feed URL and the site-level flags.
 */
@Entity
@Table(name = "site_feeds")
public class SiteFeed {

    @Id
    @Column(name = "website_url")
    private String websiteURL;

    @Column(name = "rss_url", length = 2048)
    private String rssUrl;

    @Column(name = "site_name")
    private String siteName;

    @Column(name = "paywall")
    private Boolean paywall;

    public SiteFeed(){}

    public String getWebsiteURL(){return websiteURL;}

    public void setWebsiteURL(String websiteURL){this.websiteURL = websiteURL;}

    public String getRssUrl(){return rssUrl;}

    public void setRssUrl(String rssUrl){this.rssUrl = rssUrl;}

    public String getSiteName(){return siteName;}

    public void setSiteName(String siteName){this.siteName = siteName;}

    public Boolean getPaywall(){return paywall;}

    public void setPaywall(Boolean paywall){this.paywall = paywall;}

    @Override
    public String toString() {
        return "SiteFeed [websiteURL=" + websiteURL + ", rssUrl=" + rssUrl + "]";
    }
}
