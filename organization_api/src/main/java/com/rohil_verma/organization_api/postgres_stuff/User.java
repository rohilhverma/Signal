package com.rohil_verma.organization_api.postgres_stuff;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
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
    
    private String contentMode;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Subscription> subscriptions = new ArrayList<>();

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
        subscriptions.add(sub);
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

    public String getContentMode() { return contentMode; }
    public void setContentMode(String contentMode) { this.contentMode = contentMode; }

    public List<Subscription> getSubscriptions() { return subscriptions; }
    public void setSubscriptions(List<Subscription> subscriptions) { this.subscriptions = subscriptions; }

    @Override
    public String toString() {
        return "User [id=" + id + ", username=" + username + ", email=" + email + "]";
    }
}
