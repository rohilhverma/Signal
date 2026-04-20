package com.rohil_verma.organization_api;

import java.util.List;

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

import com.rohil_verma.organization_api.Users.User;
import com.rohil_verma.organization_api.Users.UserRequest;
import com.rohil_verma.organization_api.Users.UserService;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
@RequestMapping("/user/keywords")
public class KeywordsController {

    @Autowired
    private UserService userService;

    @GetMapping
    public List<String> getUserKeywords(@AuthenticationPrincipal User currentUser) {
        return userService.listUserKeywords(currentUser.getUsername());
    }

    @PostMapping
    public ResponseEntity<String> addUserKeyword(@AuthenticationPrincipal User currentUser, @RequestBody UserRequest request) {
        return userService.addUserKeyword(currentUser.getUsername(), request.getKeyword());
    }

    @DeleteMapping
    public ResponseEntity<String> removeUserKeyword(@AuthenticationPrincipal User currentUser, @RequestBody UserRequest request) {
        return userService.removeUserKeyword(currentUser.getUsername(), request.getKeyword());
    }
}
