package com.rohil_verma.organization_api;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
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
import com.rohil_verma.organization_api.Users.UserActivityDTO;
import com.rohil_verma.organization_api.Users.UserService;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
@RequestMapping("/user/activity")
public class ActivityController {

    @Autowired
    private UserService userService;

    @PostMapping
    public ResponseEntity<String> saveUserActivity(@AuthenticationPrincipal User currentUser, @RequestBody UserActivityDTO userActivity) {
        userActivity.setUsername(currentUser.getUsername());
        return userService.saveUserActivity(userActivity);
    }

    @GetMapping
    public List<UserActivity> getUserActivity(@AuthenticationPrincipal User currentUser) {
        return userService.fetchUserActivity(currentUser.getUsername());
    }

    @DeleteMapping("/all")
    public ResponseEntity<String> deleteAllActivity(@AuthenticationPrincipal User currentUser) {
        if (!"rohil".equals(currentUser.getUsername())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return userService.deleteAllActivity();
    }
}
