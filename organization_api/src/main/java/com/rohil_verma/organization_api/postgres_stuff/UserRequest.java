package com.rohil_verma.organization_api.postgres_stuff;

public class UserRequest {
    private String username;
    private String email;
    private String websiteURL;
    private String websiteContentMode;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getWebsiteURL() { return websiteURL; }
    public void setWebsiteURL(String websiteURL) { this.websiteURL = websiteURL; }

    public String getWebsiteContentMode() { return websiteContentMode; }
    public void setWebsiteContentMode(String websiteContentMode) { this.websiteContentMode = websiteContentMode; }

    private String articleLink;
    private String articleTitle;

    public String getArticleLink() { return articleLink; }
    public void setArticleLink(String articleLink) { this.articleLink = articleLink; }

    public String getArticleTitle() { return articleTitle; }
    public void setArticleTitle(String articleTitle) { this.articleTitle = articleTitle; }
}
