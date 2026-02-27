package com.rohil_verma.organization_api.postgres_stuff;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class links_Database {

    @Id
    private int id;

    private String username;
    
    private String websiteURL;

    
}