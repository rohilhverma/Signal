package com.rohil_verma.organization_api.postgres_stuff;

public class UserRequest {
    private String username;
    private String email;
    private String websiteURL;
    private String contentMode;
    private String websiteContentMode;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getWebsiteURL() { return websiteURL; }
    public void setWebsiteURL(String websiteURL) { this.websiteURL = websiteURL; }

    public String getContentMode() { return contentMode; }
    public void setContentMode(String contentMode) { this.contentMode = contentMode; }

    public String getWebsiteContentMode() { return websiteContentMode; }
    public void setWebsiteContentMode(String websiteContentMode) { this.websiteContentMode = websiteContentMode; }
}
