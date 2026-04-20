package com.rohil_verma.organization_api.Users;

import java.util.HashMap;

public class UserRequest {
    private String username;
    private String email;
    private String websiteURL;
    private String websiteContentMode;
    private String keyword;
    private HashMap<String,Integer> userInformation;

    public HashMap<String, Integer> getUserInformation() {
        return userInformation;
    }
    public void setUserInformation(HashMap<String, Integer> userInformation) {
        this.userInformation = userInformation;
    }
    public String getKeyword() {
        return keyword;
    }
    public void setKeyword(String keyword) {
        this.keyword = keyword;
    }
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
