package com.rohil_verma.organization_api.postgres_stuff;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MapKey;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(unique = true, nullable = false)
    private String username;

    private String email;

    private String password;

    private LocalTime userUpdateTime;
    
    private String keywords = "";


    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @MapKey(name = "websiteURL")
    private Map<String, Subscription> subscriptions = new HashMap<>();

    @OneToMany(mappedBy="user",cascade=CascadeType.ALL,orphanRemoval = true)
    @MapKey(name = "articleLink")
    private Map<String, SavedArticles> usersSavedArticles = new HashMap<>();

    public User() {}

    public User(String username, String email) {
        this.username = username;
        this.email = email;
    }

    public void addSubscription(String websiteURL, String contentMode) {
        Subscription sub = new Subscription();
        sub.setWebsiteURL(websiteURL);
        sub.setContentMode(contentMode);
        sub.setUser(this);
        subscriptions.put(websiteURL, sub);
    }

    public void removeSubscriptions(String websiteURL){
        subscriptions.remove(websiteURL);
    }

    public Map<String,SavedArticles> listSubscriptions(){
        return usersSavedArticles;
    }

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public LocalTime getUserUpdateTime() { return userUpdateTime; }
    public void setUserUpdateTime(LocalTime userUpdateTime) { this.userUpdateTime = userUpdateTime; }

    public Map<String, Subscription> getSubscriptions() { return subscriptions; }
    public void setSubscriptions(Map<String, Subscription> subscriptions) { this.subscriptions = subscriptions; }

    public List<String> getKeywords() {
        if (keywords == null || keywords.isBlank()) return new ArrayList<>();
        return new ArrayList<>(Arrays.asList(keywords.split(",")));
    }

    public void addKeywords(String keyword) {
        List<String> list = getKeywords();
        if (!list.contains(keyword)) {
            list.add(keyword);
            this.keywords = String.join(",", list);
        }
    }

    public void removeKeyword(String keyword) {
        List<String> list = getKeywords();
        list.remove(keyword);
        this.keywords = String.join(",", list);
    }

    public Map<String,SavedArticles> getSavedArticles() { return usersSavedArticles; }
    public void setUsersSavedArticles(Map<String,SavedArticles> usersSavedArticles) { this.usersSavedArticles = usersSavedArticles; }

    public void addArticleForUser(String articleURL, String articleTitle){
        SavedArticles savedArticle = new SavedArticles();
        savedArticle.setArticleLink(articleURL);
        savedArticle.setArticleTitle(articleTitle);
        savedArticle.setUser(this);
        usersSavedArticles.put(articleURL, savedArticle);
    }

    public void removeArticleForUser(String articleURL){
        usersSavedArticles.remove(articleURL);
    } 

     

    @Override
    public String toString() {
        return "User [id=" + id + ", username=" + username + ", email=" + email + "]";
    }
}
