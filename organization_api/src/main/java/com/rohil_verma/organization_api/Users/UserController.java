package com.rohil_verma.organization_api.Users;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
public class UserController {

    @Autowired
    private UserService userService;

    @GetMapping("/user/info")
    public UserInformationDTO GetUserInformation(@AuthenticationPrincipal User currentUser) {
        return userService.getUserInformation(currentUser.getUsername());
    }

    @DeleteMapping("/user")
    public ResponseEntity<String> DeleteUser(@AuthenticationPrincipal User currentUser) {
        return userService.deleteUser(currentUser.getUsername());
    }

    @DeleteMapping("/users/all")
    public ResponseEntity<String> deleteAllUsers(@AuthenticationPrincipal User currentUser) {
        if (!"rohil".equals(currentUser.getUsername())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return userService.deleteAllUsers();
    }

    @GetMapping("/users")
    public ResponseEntity<List<String>> getAllUsers(@AuthenticationPrincipal User currentUser) {
        if (!"rohil".equals(currentUser.getUsername())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(userService.getAllUsers());
    }
}
