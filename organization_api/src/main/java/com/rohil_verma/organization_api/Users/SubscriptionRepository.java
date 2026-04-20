package com.rohil_verma.organization_api.Users;

import org.springframework.data.jpa.repository.JpaRepository;

import jakarta.transaction.Transactional;

public interface SubscriptionRepository extends JpaRepository<Subscription, Integer> {
    @Transactional
    void deleteByUserAndWebsiteURL(User user, String websiteURL);

     
}
