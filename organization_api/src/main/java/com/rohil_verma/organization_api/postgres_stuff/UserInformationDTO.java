package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;

public class UserInformationDTO {
    private Integer id;
    private String username;
    private List<String> websites;


    public UserInformationDTO(Integer id, String username, List<String> websites){ 
        this.id = id;
        this.username = username;
        this.websites = websites;
    }

    public Integer getId() { return id; }
    public String getUsername() { return username; }
    public List<String> getWebsites() { return websites; }
    

    
}
