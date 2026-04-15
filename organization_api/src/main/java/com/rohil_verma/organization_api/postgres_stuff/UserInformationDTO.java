package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;

public class UserInformationDTO {
    private String email;
    private String username;
    
    private List<String> websites;


    public UserInformationDTO(String email, String username, List<String> websites){ 
        this.email = email;
        this.username = username;
        this.websites = websites;
    }

    public String getEmail() { return email; }
    public String getUsername() { return username; }
    public List<String> getWebsites() { return websites; }

    
}
