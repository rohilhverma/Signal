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

    private final ServiceJWT jwtService;

    private final UserDetailsService userDetailsService;

    /**
     * Rate limit, keyed by client IP. Note that every browser request arrives via the
     * Next.js rewrite, so getRemoteAddr() is the proxy's address and all traffic shares a
     * single bucket - page loads, assets and dashboard polling all draw from the same
     * allowance. The old 10-request bucket refilling 1 token per 10s (6 req/min) was far
     * below what the feed's poll-until-plateau loop needs and returned 429 during a normal
     * Update Feed, which is longer now that summarization runs on a local model.
     */
    @Value("${security.rate-limit.enabled:true}")
    private boolean rateLimitEnabled;

    @Value("${security.rate-limit.capacity:600}")
    private long rateLimitCapacity;

    @Value("${security.rate-limit.refill-tokens:600}")
    private long rateLimitRefillTokens;

    @Value("${security.rate-limit.refill-seconds:60}")
    private long rateLimitRefillSeconds;

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    FilterJWT(ServiceJWT jwtService, UserDetailsService userDetailsService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
    }

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
    private Bucket newBucket() {
        return Bucket.builder()
            .addLimit(limit -> limit
                .capacity(rateLimitCapacity)
                .refillIntervally(rateLimitRefillTokens, Duration.ofSeconds(rateLimitRefillSeconds)))
            .build();
    }
}
