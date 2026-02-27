package com.rohil_verma.organization_api.postgres_stuff;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface links_repository extends JpaRepository<links_Database, Integer>{
    
    @Query("SELECT DISTINCT l.websiteURL FROM links_Database l WHERE l.username = :username")
    List<String> findUniqueLinksByUsername(@Param("username")String username);

}
