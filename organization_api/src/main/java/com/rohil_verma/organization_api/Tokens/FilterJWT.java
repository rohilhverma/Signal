package com.rohil_verma.organization_api.Tokens;

import java.io.IOException;
import java.time.Duration;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.github.bucket4j.Bucket;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class FilterJWT extends OncePerRequestFilter {

    @Autowired
    private ServiceJWT jwtService;

    @Autowired
    private UserDetailsService userDetailsService;

    /**
     * Rate limit, keyed by client IP. Note that every browser request arrives via the
     * Next.js rewrite, so getRemoteAddr() is the proxy's address and all traffic shares a
     * single bucket - page loads, assets and dashboard polling all draw from the same
     * allowance. The old 10-request bucket refilling 1 token per 10s (6 req/min) was far
     * below what the feed's poll-until-plateau loop needs and returned 429 during a normal
     * Update Feed, which is longer now that summarization runs on a local model.
     */
    /**
     * Single-user mode. When set, every request is authenticated as this user and the JWT
     * check is skipped entirely - there is no login page in the local build. Leave blank to
     * restore normal cookie-based auth.
     */
    @Value("${app.single-user.username:}")
    private String singleUserName;

    @Value("${security.rate-limit.enabled:true}")
    private boolean rateLimitEnabled;

    @Value("${security.rate-limit.capacity:600}")
    private long rateLimitCapacity;

    @Value("${security.rate-limit.refill-tokens:600}")
    private long rateLimitRefillTokens;

    @Value("${security.rate-limit.refill-seconds:60}")
    private long rateLimitRefillSeconds;

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        Cookie[] cookies = request.getCookies();
        String clientIP = request.getRemoteAddr();

        if (rateLimitEnabled) {
            Bucket bucket = buckets.computeIfAbsent(clientIP, k -> newBucket());
            if (!bucket.tryConsume(1)) {
                response.setStatus(429);
                response.getWriter().write("Too many requests");
                return;
            }
        }

        if (singleUserName != null && !singleUserName.isBlank()) {
            authenticateAs(singleUserName, request);
            chain.doFilter(request, response);
            return;
        }

        if (cookies == null) {
            chain.doFilter(request, response);
            return;
        }

        String token = Arrays.stream(cookies)
                .filter(c -> "accessToken".equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);

        if (token == null) {
            chain.doFilter(request, response);
            return;
        }
        try {
            Jws<Claims> userInfo = jwtService.jwtsParser(token,"jwt");
            if (userInfo == null) {
                throw new JwtException("Invalid or expired token");
            }

            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                String username = jwtService.extractUsername(userInfo);
                UserDetails user = userDetailsService.loadUserByUsername(username);
                UsernamePasswordAuthenticationToken authorizationToken = new UsernamePasswordAuthenticationToken(
                        user,
                        null,
                        user.getAuthorities()
                );
                SecurityContextHolder.getContext().setAuthentication(authorizationToken);
            }
            chain.doFilter(request, response);
        } catch (Exception e) {
            SecurityContextHolder.clearContext();
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized");
        }
    }
    /** Puts the given user into the SecurityContext so @AuthenticationPrincipal resolves. */
    private void authenticateAs(String username, HttpServletRequest request) {
        if (SecurityContextHolder.getContext().getAuthentication() != null) return;
        try {
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (Exception e) {
            logger.error("Single-user mode is configured for '" + username
                + "' but that account could not be loaded: " + e);
        }
    }

    private Bucket newBucket() {
        return Bucket.builder()
            .addLimit(limit -> limit
                .capacity(rateLimitCapacity)
                .refillIntervally(rateLimitRefillTokens, Duration.ofSeconds(rateLimitRefillSeconds)))
            .build();
    }
}
