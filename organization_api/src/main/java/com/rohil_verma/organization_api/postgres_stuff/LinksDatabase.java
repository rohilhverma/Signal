package com.rohil_verma.organization_api.postgres_stuff;

import java.time.LocalTime;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

// Represents the Database Table as a Java Class and maps the fields as columns

@Entity
public class LinksDatabase{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private String username;

    private String password;

    private String email;
    
    private String websiteURL;

    private LocalTime userUpdateTime;

    
    public LinksDatabase() {
    }

    public static LinksDatabase userSignIn(String username, String email, String websiteURL){
        LinksDatabase link = new LinksDatabase();
        link.username = username;
        link.email = email;
        link.websiteURL = websiteURL;
        return link;
    }

    public static LinksDatabase withWebsite(String username, String websiteURL) {
        LinksDatabase link = new LinksDatabase();
        link.username = username;
        link.websiteURL = websiteURL;
        return link;
    }
    
    public static LinksDatabase withPassword(String username, String password){ 
        LinksDatabase link = new LinksDatabase();
        link.username = username;
        link.password = password;
        return link;
    }

    public static LinksDatabase FullUserInformation(String username, String email, String password, LocalTime userUpdateTime){ 
        LinksDatabase link = new LinksDatabase();
        link.username = username;
        link.email = email;
        link.password = password;
        link.userUpdateTime = userUpdateTime;
        return link;
    }

    public Integer getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }
    
    public String getPassword() {return password;}

    public void setId(Integer id) {
        this.id = id;
    }

    public void setPassword(String password){
        this.password = password;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getUsername() {
        return username;
    }

    public String getWebsiteURL() {
        return websiteURL;
    }

    public void setWebsiteURL(String websiteURL) {
        this.websiteURL = websiteURL;
    }

    public LocalTime getUserUpdateTime() {
        return userUpdateTime;
    }

    public void setUserUpdateTime(LocalTime userUpdateTime) {
        this.userUpdateTime = userUpdateTime;
    }


    @Override
    public String toString() {
        return "LinksDatabase [id=" + id + ", username=" + username + ", websiteURL=" + websiteURL + "]";
    }

    

}