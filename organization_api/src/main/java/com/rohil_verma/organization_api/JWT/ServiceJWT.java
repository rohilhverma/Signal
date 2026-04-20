package com.rohil_verma.organization_api.JWT;

import com.rohil_verma.organization_api.Users.UserRepository;
import java.util.Date;
import java.time.*;
import java.time.temporal.ChronoUnit;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import com.rohil_verma.organization_api.Users.User;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

import jakarta.annotation.PostConstruct;

/* Contains the various methods needed for the endpoints, builds a token for user a user assuming they're signed in, returns a claims object to allow access to payload/headers,
Checks validity of a token
*/ 


@Service
public class ServiceJWT{

    private final UserRepository userRepository;

    @Value("${SECRET_KEY}")
    private String secretKeyString;

    private SecretKey secretKey;

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    ServiceJWT(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostConstruct
    void init(){
        byte[] keyBytes = Decoders.BASE64.decode(secretKeyString);
        this.secretKey = Keys.hmacShaKeyFor(keyBytes);
    }

    String tokenBuilder(String username){
        Instant now = Instant.now();
        return Jwts.builder()
        .subject(username)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(1, ChronoUnit.HOURS)))
        .signWith(secretKey)
        .compact();
    }

    String passwordHasher(String password){
        return passwordEncoder.encode(password);
    }

    Jws<Claims> jwtsParser(String token){ 
        try{
            JwtParser jwt = Jwts.parser()
            .verifyWith(secretKey)
            .build();
            Jws<Claims> jws = jwt.parseSignedClaims(token);
            return jws;
        } catch (JwtException e){return null;}
    }

    String extractUsername(Jws<Claims> jws){
        return jws.getPayload().getSubject();
    }

    Boolean tokenValidity(String token, String username){
        if (extractUsername(jwtsParser(token)).equals(username)){return true;}
        return false;
    }

    ResponseEntity<String> signup(AuthRequest request) {
        if (userRepository.findByUsername(request.getUsername()).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body("Username already taken");
        }
        User user = new User();
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        userRepository.save(user);
        return ResponseEntity.ok(tokenBuilder(user.getUsername()));
    }

    ResponseEntity<String> signin(AuthRequest request) {
        authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
        );
        return ResponseEntity.ok(tokenBuilder(request.getUsername()));
    }




}