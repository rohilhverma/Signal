package com.rohil_verma.organization_api.Personalization;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.rohil_verma.organization_api.Users.User;

/** The For You feed. Style matches {@code WebsiteController} / {@code ActivityController}. */
@RestController
@CrossOrigin(origins = "http://localhost:3000")
public class ForYouController {

    @Autowired
    private PersonalizationService personalizationService;

    @GetMapping("/user/feed/foryou")
    public ForYouResponse forYou(@AuthenticationPrincipal User currentUser) {
        return personalizationService.score(currentUser.getUsername());
    }
}
