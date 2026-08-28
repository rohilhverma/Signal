package com.rohil_verma.organization_api.Jobs;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * One unit of scraping work. Replaces the durability SQS used to provide: a job that
 * cannot run now (machine asleep, scraper down, site failing) stays on the table and is
 * picked up later, rather than being fired into the void.
 */
@Entity
@Table(name = "scrape_jobs",
       indexes = @Index(name = "idx_scrape_jobs_claim", columnList = "status, scheduled_for"))
public class ScrapeJob {

    public static final String PENDING = "pending";
    public static final String RUNNING = "running";
    public static final String DONE    = "done";
    public static final String FAILED  = "failed";

    /** Queued because a person pressed Update Feed - runs regardless of whether the machine is idle. */
    public static final String SOURCE_USER = "user";
    /** Queued by the background refresh - only runs while the machine is idle. */
    public static final String SOURCE_SCHEDULED = "scheduled";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "username", nullable = false)
    private String username;

    @Column(name = "website_url", nullable = false)
    private String websiteURL;

    /** Already translated into the scraper's vocabulary (shorter/default/longer). */
    @Column(name = "mode", nullable = false)
    private String mode;

    @Column(name = "status", nullable = false)
    private String status = PENDING;

    @Column(name = "source", nullable = false)
    private String source = SOURCE_SCHEDULED;

    @Column(name = "attempts", nullable = false)
    private int attempts = 0;

    @Column(name = "scheduled_for", nullable = false)
    private Instant scheduledFor = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "last_error", columnDefinition = "text")
    private String lastError;

    public ScrapeJob(){}

    public ScrapeJob(String username, String websiteURL, String mode, String source) {
        this.username = username;
        this.websiteURL = websiteURL;
        this.mode = mode;
        this.source = source;
    }

    public Integer getId(){return id;}
    public void setId(Integer id){this.id = id;}

    public String getUsername(){return username;}
    public void setUsername(String username){this.username = username;}

    public String getWebsiteURL(){return websiteURL;}
    public void setWebsiteURL(String websiteURL){this.websiteURL = websiteURL;}

    public String getMode(){return mode;}
    public void setMode(String mode){this.mode = mode;}

    public String getStatus(){return status;}
    public void setStatus(String status){this.status = status;}

    public String getSource(){return source;}
    public void setSource(String source){this.source = source;}

    public int getAttempts(){return attempts;}
    public void setAttempts(int attempts){this.attempts = attempts;}

    public Instant getScheduledFor(){return scheduledFor;}
    public void setScheduledFor(Instant scheduledFor){this.scheduledFor = scheduledFor;}

    public Instant getUpdatedAt(){return updatedAt;}
    public void setUpdatedAt(Instant updatedAt){this.updatedAt = updatedAt;}

    public String getLastError(){return lastError;}
    public void setLastError(String lastError){this.lastError = lastError;}

    @Override
    public String toString() {
        return "ScrapeJob [" + websiteURL + " mode=" + mode + " status=" + status + " attempts=" + attempts + "]";
    }
}
