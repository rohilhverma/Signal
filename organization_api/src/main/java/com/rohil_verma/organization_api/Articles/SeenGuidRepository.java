package com.rohil_verma.organization_api.Articles;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;

import jakarta.transaction.Transactional;

public interface SeenGuidRepository extends JpaRepository<SeenGuid, String> {
    @Transactional
    int deleteByProcessedAtBefore(Instant cutoff);
}
