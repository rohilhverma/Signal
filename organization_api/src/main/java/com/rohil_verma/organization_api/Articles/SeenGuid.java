package com.rohil_verma.organization_api.Articles;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Replaces the SK="EXISTS" dedupe markers. Written by the scraper, read by the
 * scraper's guid check; the API only touches these to expire them.
 */
@Entity
@Table(name = "seen_guids")
public class SeenGuid {

    @Id
    @Column(name = "guid", length = 2048)
    private String guid;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;

    public SeenGuid(){}

    public String getGuid(){return guid;}

    public void setGuid(String guid){this.guid = guid;}

    public Instant getProcessedAt(){return processedAt;}

    public void setProcessedAt(Instant processedAt){this.processedAt = processedAt;}
}
