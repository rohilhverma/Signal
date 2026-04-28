package com.rohil_verma.organization_api.Tokens;

import com.rohil_verma.organization_api.Users.UserRepository;
import java.util.Date;
import java.security.Key;
import java.time.*;
import java.time.temporal.ChronoUnit;
import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class ServiceJWT {

    private static final Logger log = LoggerFactory.getLogger(ServiceJWT.class);

    private final UserRepository userRepository;

    private final RefreshTokenRepository refreshRepository;

    @Value("${SECRET_KEY}")
    private String secretKeyString;

    @Value("${SECRET_REFRESH_KEY}")
    private String secretRefreshKeyString;

    private SecretKey saltKey;

    private SecretKey saltRefreshKey;

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    ServiceJWT(UserRepository userRepository, RefreshTokenRepository refreshTokenRepository) {
        this.userRepository = userRepository;
        this.refreshRepository = refreshTokenRepository;
    }

    @PostConstruct
    void init() {
        this.saltKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secretKeyString));
        this.saltRefreshKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secretRefreshKeyString));
    }

    String tokenBuilder(String user, String type) {
        Instant now = Instant.now();
        Key key;
        int amountToadd;
        ChronoUnit time;
        if (("jwt").equals(type)) {
            key = saltKey;
            amountToadd = 1;
            time = ChronoUnit.HOURS;
        } else {
            key = saltRefreshKey;
            amountToadd = 7;
            time = ChronoUnit.DAYS;
        }
        return Jwts.builder()
                .subject(user)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(amountToadd, time)))
                .signWith(key)
                .compact();
    }

    Jws<Claims> jwtsParser(String token, String type) {
        try {
            SecretKey specificKey = "jwt".equals(type) ? this.saltKey : this.saltRefreshKey;
            JwtParser jwt = Jwts.parser()
                    .verifyWith(specificKey)
                    .build();
            return jwt.parseSignedClaims(token);
        } catch (JwtException e) {
            return null;
        }
    }

    String extractUsername(Jws<Claims> jws) {
        return jws.getPayload().getSubject();
    }

    String refreshTokenBuilder(User user, boolean rememberMe) {
        RefreshToken token = refreshRepository.findByUser(user).orElse(new RefreshToken());
        token.setUser(user);
        token.setToken(tokenBuilder(user.getUniqueUUID().toString(), "refresh"));
        token.setCreatedAt(Instant.now());
        token.setExpireAt(Instant.now().plus(7, ChronoUnit.DAYS));
        token.setRememberMe(rememberMe);
        refreshRepository.save(token);
        return token.getToken();
    }

    private ResponseCookie buildAccessCookie(String accessToken) {
        return ResponseCookie.from("accessToken", accessToken)
                .httpOnly(true)
                .secure(false)
                .path("/")
                .maxAge(Duration.ofHours(1))
                .sameSite("Strict")
                .build();
    }

    private ResponseCookie buildRefreshCookie(String refreshToken, boolean rememberMe) {
        ResponseCookie.ResponseCookieBuilder refreshBuilder = ResponseCookie.from("refreshToken", refreshToken)
                .httpOnly(true)
                .secure(false)
                .path("/auth")
                .sameSite("Strict");

        if (rememberMe) {
            refreshBuilder.maxAge(Duration.ofDays(30));
        }

        return refreshBuilder.build();
    }

    private ResponseCookie buildExpiredCookie(String name, String path) {
        return ResponseCookie.from(name, "")
                .httpOnly(true)
                .secure(false)
                .path(path)
                .sameSite("Strict")
                .maxAge(Duration.ZERO)
                .build();
    }

    private ResponseEntity<Void> buildAuthResponse(String accessToken, String refreshToken, boolean rememberMe) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildAccessCookie(accessToken).toString())
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(refreshToken, rememberMe).toString())
                .build();
    }

    private ResponseEntity<Void> buildLogoutResponse() {
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, buildExpiredCookie("accessToken", "/").toString())
                .header(HttpHeaders.SET_COOKIE, buildExpiredCookie("refreshToken", "/auth").toString())
                .build();
    }

    ResponseEntity<Void> signup(AuthRequest request) {
        log.info("[AUTH] POST /auth/signup - username: " + request.getUsername());
        if (userRepository.findByUsername(request.getUsername()).isPresent()) {
            log.info("[AUTH] Signup failed - username already exists: " + request.getUsername());
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        User user = new User();
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        userRepository.saveAndFlush(user);
        String refreshToken = refreshTokenBuilder(user, request.isRememberMe());
        String accessToken = tokenBuilder(user.getUsername(), "jwt");
        log.info("[AUTH] Signup success - username: " + request.getUsername());
        return buildAuthResponse(accessToken, refreshToken, request.isRememberMe());
    }

    ResponseEntity<Void> signin(AuthRequest request) {
        log.info("[AUTH] POST /auth/signin - username: " + request.getUsername());
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword()));
        User user = userRepository.findByUsername(request.getUsername()).orElseThrow();
        String refreshToken = refreshTokenBuilder(user, request.isRememberMe());
        String accessToken = tokenBuilder(user.getUsername(), "jwt");
        log.info("[AUTH] Signin success - username: " + request.getUsername());
        return buildAuthResponse(accessToken, refreshToken, request.isRememberMe());
    }

    ResponseEntity<Void> refreshToken(String incomingToken) {
        log.info("[AUTH] POST /auth/refresh - attempting token rotation");
        if (jwtsParser(incomingToken, "refresh") == null) {
            log.info("[AUTH] Refresh failed - invalid or expired token");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        RefreshToken stored = refreshRepository.findByToken(incomingToken).orElse(null);
        if (stored == null || stored.getExpireAt().isBefore(Instant.now())) {
            log.info("[AUTH] Refresh failed - token not found or expired in DB");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        User user = stored.getUser();
        boolean rememberMe = stored.isRememberMe();
        refreshRepository.delete(stored);

        String newRefreshToken = refreshTokenBuilder(user, rememberMe);
        String newAccessToken = tokenBuilder(user.getUsername(), "jwt");
        log.info("[AUTH] Refresh success - username: " + user.getUsername());
        return buildAuthResponse(newAccessToken, newRefreshToken, rememberMe);
    }

    ResponseEntity<Void> logout(String incomingToken) {
        log.info("[AUTH] POST /auth/logout");
        if (incomingToken != null && !incomingToken.isBlank()) {
            refreshRepository.findByToken(incomingToken).ifPresent(refreshRepository::delete);
        }
        log.info("[AUTH] Logout success - cookies cleared");
        return buildLogoutResponse();
    }

}
