package com.rohil_verma.organization_api.Users;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.rohil_verma.organization_api.UserActivity;

@Repository
public interface UserActivityRepository extends JpaRepository<UserActivity, Integer> {
    List<UserActivity> findByUser(User user);
}
