package com.rohil_verma.organization_api.Website;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;

import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.rohil_verma.organization_api.Articles.ArticleFeedView;
import com.rohil_verma.organization_api.Articles.ArticleService;
import com.rohil_verma.organization_api.Users.MuteRequest;
import com.rohil_verma.organization_api.Users.Subscription;
import com.rohil_verma.organization_api.Users.SubscriptionDTO;
import com.rohil_verma.organization_api.Users.User;
import com.rohil_verma.organization_api.Users.UserRequest;
import com.rohil_verma.organization_api.Users.UserService;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
public class WebsiteController {

    @Autowired
    private UserService userService;

    @Autowired
    private ArticleService articleService;

    @GetMapping("/links/user")
    public List<String> WebsitesForUser(@AuthenticationPrincipal User currentUser) {
        return userService.getWebsitesForUser(currentUser.getUsername());
    }

    @GetMapping("/websites/all")
    public List<String> AllWebsites() {
        return userService.getWebsites();
    }

    @PostMapping("/user/task")
    public ResponseEntity<String> SendScrapingTask(@AuthenticationPrincipal User currentUser) {
        return userService.sendScrapingTask(currentUser.getUsername());
    }

    @DeleteMapping("/user/url")
    public void deleteWebsiteForUser(@AuthenticationPrincipal User currentUser, @RequestBody UserRequest request) {
        System.out.println("username: " + currentUser.getUsername() + " url: " + request.getWebsiteURL());

        userService.deleteWebsiteForUser(currentUser.getUsername(), request.getWebsiteURL());
    }

    @GetMapping("/user/website")
    public Map<String, WebsiteContent> returnUserContent(@AuthenticationPrincipal User currentUser) {
        return articleService.getUserContent(currentUser.getUsername());
    }

    @PostMapping("/user/website")
    public ResponseEntity<String> addWebsiteForUser(@AuthenticationPrincipal User currentUser, @RequestBody UserRequest request) {
        ResponseEntity<String> response = userService.addWebsiteForUser(currentUser.getUsername(), request.getWebsiteURL(), request.getWebsiteContentMode());
        System.out.println(response + "\n\n" + currentUser.getUsername() + "\n" + request.getWebsiteURL() + "\n");
        return response;
    }

    /**
     * Scoped to the same 7-day retention window and subscribed sites as the dashboard
     * itself - see {@link ArticleService#searchUserArticles}. {@code q} shorter than 2
     * characters returns an empty list rather than a full-table dump.
     */
    @GetMapping("/user/search")
    public List<ArticleFeedView> searchUserArticles(@AuthenticationPrincipal User currentUser, @RequestParam("q") String q) {
        return articleService.searchUserArticles(currentUser.getUsername(), q);
    }

    /** Every subscribed source with its mute state - the sources screen reads this, not the feed. */
    @GetMapping("/user/sources")
    public List<SubscriptionDTO> userSources(@AuthenticationPrincipal User currentUser) {
        return userService.getSubscriptionsForUser(currentUser.getUsername());
    }

    /**
     * Hides a source from the dashboard, search and For You.
     *
     * <p>Omitting {@code days} mutes with no end date, which also drops the site from the
     * nightly enqueue. Passing a day count snoozes instead: the scrape keeps running, so the
     * backlog is waiting when it comes back. Capped at a year because a longer snooze is an
     * indefinite mute that has forgotten it is one.
     */
    @PostMapping("/user/website/mute")
    public ResponseEntity<String> muteWebsite(@AuthenticationPrincipal User currentUser, @RequestBody MuteRequest request) {
        Integer days = request.days();
        if (days != null && (days < 1 || days > 365)) {
            return ResponseEntity.badRequest().body("days must be between 1 and 365, or omitted to mute indefinitely");
        }
        Instant until = days == null
            ? Subscription.MUTED_INDEFINITELY
            : Instant.now().plus(days, ChronoUnit.DAYS);
        return applyMute(currentUser.getUsername(), request.websiteURL(), until);
    }

    @DeleteMapping("/user/website/mute")
    public ResponseEntity<String> unmuteWebsite(@AuthenticationPrincipal User currentUser, @RequestBody MuteRequest request) {
        return applyMute(currentUser.getUsername(), request.websiteURL(), null);
    }

    /** The cache drop has to happen on both paths, so neither endpoint owns it. */
    private ResponseEntity<String> applyMute(String username, String websiteURL, Instant until) {
        ResponseEntity<String> response = userService.setMuteForUser(username, websiteURL, until);
        if (response.getStatusCode().is2xxSuccessful()) {
            articleService.invalidateUserContent(username);
        }
        return response;
    }

    @GetMapping("/user/website/cache")
    public ConcurrentMap<String, @NonNull String> getMethodName() {
        return articleService.cacheContent();
    }

    @PostMapping("/user/url/resummarization")
    public String resummarize(@RequestBody UserRequest request) throws Exception {
        String result = articleService.resummarizeRequest(request.getArticleLink(), request.getWebsiteContentMode());
        articleService.updateSummary(request.getWebsiteURL(), request.getArticleLink(), request.getWebsiteContentMode(), result);
        return result;
    }
}
