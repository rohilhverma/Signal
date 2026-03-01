package com.rohil_verma.organization_api.postgres_stuff;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.transaction.Transactional;

import java.util.List;

//This talks directly to the Database

public interface LinksRepository extends JpaRepository<LinksDatabase, Integer> {
    
    @Query("SELECT DISTINCT l.websiteURL FROM LinksDatabase l WHERE l.username = :username")
    List<String> findUniqueLinksByUsername(@Param("username")String username);

    @Query("SELECT DISTINCT l.username FROM LinksDatabase l")
    List<String> findAllUsernames();
    
    @Query("SELECT DISTINCT l.websiteURL FROM LinksDatabase l")
    List<String> findAllWebsites();

    @Query("SELECT DISTINCT l.email FROM LinksDatabase l WHERE l.username = :username")
    String findUserEmailFromUsername(@Param("username")String username);

    @Query("SELECT DISTINCT l.username FROM LinksDatabase l where l.email = :email")
    String findUsernameFromEmail(@Param("email")String email);

    @Transactional
    void deleteByUsernameAndWebsiteURL(String username, String websiteURL);



}
