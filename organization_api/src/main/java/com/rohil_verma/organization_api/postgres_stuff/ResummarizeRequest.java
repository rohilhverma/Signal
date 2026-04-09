package com.rohil_verma.organization_api.postgres_stuff;

public class ResummarizeRequest {
    private String articleLink;
    private String mode;

    public String getArticleLink() { return articleLink; }
    public void setArticleLink(String articleLink) { this.articleLink = articleLink; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
}
