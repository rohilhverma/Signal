package com.rohil_verma.organization_api.Tokens;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class ControllerJWT {

    @Autowired
    private ServiceJWT serviceJWT;

    @PostMapping("/signup")
    public ResponseEntity<Void> signup(@RequestBody AuthRequest userAuthRequest) {
        return serviceJWT.signup(userAuthRequest);
    }

    @PostMapping("/signin")
    public ResponseEntity<Void> signin(@RequestBody AuthRequest userAuthRequest) {
        return serviceJWT.signin(userAuthRequest);
    }

    @PostMapping("/refresh")
    public ResponseEntity<Void> refresh(@CookieValue("refreshToken") String refreshToken) {
        return serviceJWT.refreshToken(refreshToken);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(value = "refreshToken", required = false) String refreshToken) {
        return serviceJWT.logout(refreshToken);
    }

}
