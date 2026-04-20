package com.rohil_verma.organization_api.Users;

import java.util.HashMap;

public class UserActivityDTO {
    private String username;
    private HashMap<String, Integer> activity;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public HashMap<String, Integer> getActivity() { return activity; }
    public void setActivity(HashMap<String, Integer> activity) { this.activity = activity; }
}
