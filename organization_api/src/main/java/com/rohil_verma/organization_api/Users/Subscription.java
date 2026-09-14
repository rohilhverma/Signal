package com.rohil_verma.organization_api.Users;

import java.time.Instant;

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

    /**
     * Sentinel for a mute with no end date. One nullable column carries both cases - null
     * is "not muted", any future instant is "muted until then" - so the check stays a
     * single comparison in Java and in SQL. A far-future timestamp rather than a second
     * boolean column, because two fields admit pairs that mean nothing ("indefinite, but
     * only until Tuesday") and every reader would have to know which one wins.
     */
    public static final Instant MUTED_INDEFINITELY = Instant.parse("9999-12-31T00:00:00Z");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private String websiteURL;

    private String contentMode;

    /** Null means active. See {@link #MUTED_INDEFINITELY} for the no-end-date case. */
    private Instant mutedUntil;

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

    public Instant getMutedUntil(){return mutedUntil;}

    public void setMutedUntil(Instant mutedUntil){this.mutedUntil = mutedUntil;}

    /** True while the source should be kept out of the dashboard, search and For You. */
    public boolean isMuted(Instant now){
        return mutedUntil != null && mutedUntil.isAfter(now);
    }

    /**
     * Only an indefinite mute also stops the nightly scrape. A timed snooze keeps
     * scraping, so coming back to it finds a populated backlog rather than an empty page -
     * the trade is Gemini/Ollama spend on a source nobody is reading in the meantime.
     */
    public boolean isMutedIndefinitely(){
        return MUTED_INDEFINITELY.equals(mutedUntil);
    }

    public User getUser() {return user;}
    
    public void setUser(User user){this.user = user;}

    @Override
    public String toString() {
        return "Subscription [id=" + id + ", websiteURL=" + websiteURL
            + (mutedUntil == null ? "" : ", mutedUntil=" + mutedUntil) + "]";
    }
}
