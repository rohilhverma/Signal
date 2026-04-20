package com.rohil_verma.organization_api.Users;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
@RequestMapping("/user/saved/articles")
public class SavedArticlesController {

    @Autowired
    private UserService userService;

    @GetMapping
    public Map<String, String> getSavedArticles(@AuthenticationPrincipal User currentUser) {
        return userService.userSavedArticles(currentUser.getUsername());
    }

    @PostMapping
    public ResponseEntity<String> saveArticleForUser(@AuthenticationPrincipal User currentUser, @RequestBody UserRequest request) {
        return userService.addArticleForUser(currentUser.getUsername(), request.getArticleLink(), request.getArticleTitle());
    }

    @DeleteMapping
    public ResponseEntity<String> deleteArticleForUser(@AuthenticationPrincipal User currentUser, @RequestBody UserRequest request) {
        return userService.removeArticleForUser(currentUser.getUsername(), request.getArticleLink());
    }
}
