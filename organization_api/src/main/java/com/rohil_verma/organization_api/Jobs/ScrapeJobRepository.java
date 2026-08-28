package com.rohil_verma.organization_api.Jobs;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.transaction.Transactional;

public interface ScrapeJobRepository extends JpaRepository<ScrapeJob, Integer> {

    /**
     * Claims due work. FOR UPDATE SKIP LOCKED is what makes this an actual queue rather
     * than a table two workers can both read - a locked row is invisible to the next
     * caller instead of blocking it. Must run inside a transaction; the lock is held
     * until commit.
     */
    @Query(value = """
        SELECT * FROM scrape_jobs
        WHERE status = 'pending' AND scheduled_for <= now()
        ORDER BY scheduled_for
        LIMIT :limit
        FOR UPDATE SKIP LOCKED
        """, nativeQuery = true)
    List<ScrapeJob> lockNext(@Param("limit") int limit);

    @Query(value = """
        SELECT * FROM scrape_jobs
        WHERE status = 'pending' AND scheduled_for <= now() AND source = :source
        ORDER BY scheduled_for
        LIMIT :limit
        FOR UPDATE SKIP LOCKED
        """, nativeQuery = true)
    List<ScrapeJob> lockNextBySource(@Param("source") String source, @Param("limit") int limit);

    boolean existsByUsernameAndWebsiteURLAndStatusIn(String username, String websiteURL, Collection<String> statuses);

    long countByStatus(String status);

    @Transactional
    @Modifying
    @Query("delete from ScrapeJob j where j.status in ('done','failed') and j.updatedAt < :cutoff")
    int purgeFinishedBefore(@Param("cutoff") Instant cutoff);
}
