package com.rohil_verma.organization_api.Articles;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SiteFeedRepository extends JpaRepository<SiteFeed, String> {
    List<SiteFeed> findByWebsiteURLIn(Collection<String> websiteURLs);
}
