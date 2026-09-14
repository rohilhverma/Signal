package com.rohil_verma.organization_api.Users;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
@RequestMapping("/user/stats")
public class UserStatsController {

    @Autowired
    private UserStatsService userStatsService;

    @GetMapping
    public UserStatsService.Stats getStats(@AuthenticationPrincipal User currentUser) {
        return userStatsService.forUsername(currentUser.getUsername());
    }
}
