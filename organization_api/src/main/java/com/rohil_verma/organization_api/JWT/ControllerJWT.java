package com.rohil_verma.organization_api.JWT;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<String> signup(@RequestBody AuthRequest userAuthRequest) {
        return serviceJWT.signup(userAuthRequest);
    }

    @PostMapping("/signin")
    public ResponseEntity<String> signin(@RequestBody AuthRequest userAuthRequest) {
        return serviceJWT.signin(userAuthRequest);
    }
    

}
