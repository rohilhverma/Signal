package com.rohil_verma.organization_api.Users;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "subscriptions")
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private String websiteURL;

    private String contentMode;

    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;

    public Subscription(){}

    public Integer getId() {return id;}

    public void setId(Integer id){this.id = id;}

    public String getWebsiteURL(){return websiteURL;}

    public void setWebsiteURL(String websiteURL){this.websiteURL = websiteURL;}

    public String getContentMode(){return contentMode;}

    public void setContentMode(String contentMode){this.contentMode = contentMode;}

    public User getUser() {return user;}
    
    public void setUser(User user){this.user = user;}

    @Override
    public String toString() {
        return "Subscription [id=" + id + ", websiteURL=" + websiteURL + "]";
    }
}
