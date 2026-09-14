package com.rohil_verma.organization_api.Users;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.rohil_verma.organization_api.Articles.ArticleRepository;
import com.rohil_verma.organization_api.Articles.ArticleService;
import com.rohil_verma.organization_api.Jobs.ScrapeJob;
import com.rohil_verma.organization_api.Jobs.ScrapeJobRunner;
import com.rohil_verma.organization_api.Jobs.ScrapeJobService;
import com.rohil_verma.organization_api.Personalization.ProfileService;
import com.rohil_verma.organization_api.UserActivity;

@Service
@Transactional
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private ArticleRepository articleRepository;

    @Autowired
    private UserActivityRepository userActivityRepository;

    @Autowired
    private UserActiveDayRepository userActiveDayRepository;

    @Autowired
    private ScrapeJobService scrapeJobService;

    @Autowired
    private ScrapeJobRunner scrapeJobRunner;

    @Autowired
    private ProfileService profileService;

    static String normalizeWebsiteUrl(String input) {
        if (input == null) {
            throw new IllegalArgumentException("Website URL is required");
        }
        String s = input.trim();
        if (s.isEmpty()) {
            throw new IllegalArgumentException("Website URL is required");
        }
        s = s.replaceFirst("(?i)^https?://", "");
        s = s.replaceFirst("^//", "");
        int atIdx = s.indexOf('@');
        if (atIdx >= 0) {
            s = s.substring(atIdx + 1);
        }
        int slashIdx = s.indexOf('/');
        if (slashIdx >= 0) {
            s = s.substring(0, slashIdx);
        }
        int qIdx = s.indexOf('?');
        if (qIdx >= 0) {
            s = s.substring(0, qIdx);
        }
        int hashIdx = s.indexOf('#');
        if (hashIdx >= 0) {
            s = s.substring(0, hashIdx);
        }
        s = s.toLowerCase(Locale.ROOT);
        if (s.isEmpty()) {
            throw new IllegalArgumentException("Invalid website URL: " + input);
        }
        if (!s.contains(".")) {
            s = s + ".com";
        }
        long dotCount = s.chars().filter(c -> c == '.').count();
        if (dotCount == 1 && !s.startsWith("www.")) {
            s = "www." + s;
        }
        if (!s.matches("^[a-z0-9.-]+$")) {
            throw new IllegalArgumentException("Invalid website URL: " + input);
        }
        if (s.startsWith(".") || s.endsWith(".") || s.contains("..")) {
            throw new IllegalArgumentException("Invalid website URL: " + input);
        }
        return s;
    }

    public List<String> getWebsitesForUser(String username) {
        return userRepository.findByUsername(username)
            .map(user -> user.getSubscriptions().keySet().stream().toList())
            .orElse(List.of());
    }

    /**
     * {@link #getWebsitesForUser} minus anything currently muted - the list a reader should
     * actually see. The dashboard, search and For You all scope through here, so muting a
     * source removes it from every read path at once.
     *
     * <p>Source management deliberately keeps using the unfiltered list. Filter there too and
     * a muted source would vanish from the only screen that can un-mute it.
     */
    public List<String> getVisibleWebsitesForUser(String username) {
        Instant now = Instant.now();
        return userRepository.findByUsername(username)
            .map(user -> user.getSubscriptions().values().stream()
                .filter(sub -> !sub.isMuted(now))
                .map(Subscription::getWebsiteURL)
                .toList())
            .orElse(List.of());
    }

    /**
     * Website URL to the subscription's content mode, for callers that need to act on the
     * per-source mode rather than just the list of sites.
     *
     * <p>This is the scrape path, so it filters on {@link Subscription#isMutedIndefinitely()}
     * and not {@link Subscription#isMuted}: a timed snooze keeps collecting in the background
     * so that coming back to it finds a populated backlog, and only an open-ended mute is
     * worth stopping the nightly work - and the summarizer spend - for.
     */
    public Map<String, String> getSubscriptionModesForUser(String username) {
        return userRepository.findByUsername(username)
            .map(user -> user.getSubscriptions().entrySet().stream()
                .filter(entry -> !entry.getValue().isMutedIndefinitely())
                .collect(Collectors.toMap(
                    Map.Entry::getKey,
                    entry -> entry.getValue().getContentMode() == null ? "" : entry.getValue().getContentMode()
                )))
            .orElse(Map.of());
    }

    /**
     * Every subscribed site with its mute state, for the sources screen. Sorted by URL so the
     * list does not reshuffle between renders.
     */
    public List<SubscriptionDTO> getSubscriptionsForUser(String username) {
        Instant now = Instant.now();
        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null) return List.of();

        // Counted here rather than derived on the client from the dashboard payload: that
        // payload omits muted sources, so a client-side tally would report every muted
        // source as empty.
        List<String> sites = user.getSubscriptions().keySet().stream().toList();
        Map<String, Long> counts = sites.isEmpty() ? Map.of() : articleRepository
            .countByWebsiteURLSince(sites, now.minus(ArticleService.FRESHNESS_HOURS, ChronoUnit.HOURS))
            .stream()
            .collect(Collectors.toMap(row -> (String) row[0], row -> (Long) row[1]));

        return user.getSubscriptions().values().stream()
            .sorted(Comparator.comparing(Subscription::getWebsiteURL))
            .map(sub -> new SubscriptionDTO(
                sub.getWebsiteURL(),
                sub.getContentMode() == null ? "" : sub.getContentMode(),
                sub.isMuted(now) ? sub.getMutedUntil() : null,
                sub.isMuted(now) && sub.isMutedIndefinitely(),
                counts.getOrDefault(sub.getWebsiteURL(), 0L).intValue()))
            .toList();
    }

    /**
     * Mutes a source until {@code until}, or with no end date when that is
     * {@link Subscription#MUTED_INDEFINITELY}. A null {@code until} clears the mute.
     *
     * <p>Deliberately leaves {@code user_scores} alone. Muting is a display decision, and
     * decaying the affinity behind it would mean un-muting a source you liked for a year
     * hands you back a stranger.
     */
    public ResponseEntity<String> setMuteForUser(String username, String websiteURL, Instant until) {
        String normalizedURL;
        try {
            normalizedURL = normalizeWebsiteUrl(websiteURL);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }

        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null) return ResponseEntity.status(404).body("User not found");

        Subscription sub = user.getSubscriptions().get(normalizedURL);
        if (sub == null) return ResponseEntity.status(404).body("Not subscribed to " + normalizedURL);

        sub.setMutedUntil(until);
        subscriptionRepository.save(sub);
        log.info("{} {} for {}", until == null ? "Unmuted" : "Muted until " + until, normalizedURL, username);
        return ResponseEntity.ok(until == null ? "Unmuted" : "Muted");
    }

    public List<String> getWebsites() {
        return subscriptionRepository.findAll().stream()
            .map(Subscription::getWebsiteURL)
            .distinct()
            .toList();
    }

    public List<String> getAllUsers() {
        return userRepository.findAll().stream()
            .map(User::getUsername)
            .toList();
    }


    public ResponseEntity<String> addWebsiteForUser(String username,  String websiteURL,String contentMode){
        String normalizedURL;
        try {
            normalizedURL = normalizeWebsiteUrl(websiteURL);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
        try {
            User currentUser = userRepository.findByUsername(username).orElseThrow();
            currentUser.addSubscription(normalizedURL, contentMode);
            userRepository.save(currentUser);
            return ResponseEntity.ok("New Source " + normalizedURL + " added to user: " + username);
        } catch (Exception e){return ResponseEntity.status(500).body("Failed to Upload Source");}
    }

    public UserInformationDTO getUserInformation(String username) {
        return userRepository.findByUsername(username)
            .map(user -> new UserInformationDTO(
                user.getEmail(),
                user.getUsername(),
                user.getSubscriptions().keySet().stream().toList()))
            .orElse(new UserInformationDTO(null, null, null));
    }

    public ResponseEntity<String> deleteUser(String username) {
        try {
            userRepository.findByUsername(username).ifPresent(userRepository::delete);
            return ResponseEntity.ok("User Deleted");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Failed to Delete User");
        }
    }

    public void deleteWebsiteForUser(String username, String websiteURL) {
        String normalizedURL = normalizeWebsiteUrl(websiteURL);
        userRepository.findByUsername(username).ifPresent(user -> {
            user.getSubscriptions().remove(normalizedURL);
            userRepository.save(user);
        });
    }

    public ResponseEntity<String> addUser(String username, String email, String websiteURL,
                                          String websiteContentMode) {
        String normalizedURL;
        try {
            normalizedURL = normalizeWebsiteUrl(websiteURL);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
        try {
            User user = userRepository.findByUsername(username).orElseGet(() -> {
                User newUser = new User(username, email);
                return userRepository.save(newUser);
            });
            if (websiteContentMode == null) {
                return ResponseEntity.badRequest()
                    .body("A website content mode is required");
            }
            user.addSubscription(normalizedURL, websiteContentMode);
            userRepository.save(user);
            scrapeJobService.enqueue(username, getSubscriptionModesForUser(username), ScrapeJob.SOURCE_USER);
            scrapeJobRunner.kick();
            return ResponseEntity.ok("User Saved");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Failed to Save User");
        }
    }

    public Map<String, String> userSavedArticles(String username) {
        return userRepository.findByUsername(username)
            .map(user -> user.getSavedArticles().values().stream()
                .collect(Collectors.toMap(
                    SavedArticles::getArticleTitle,
                    SavedArticles::getArticleLink
                )))
            .orElse(Map.of());
    }


    public ResponseEntity<String> sendScrapingTask(String username) {
        try {
            scrapeJobService.enqueue(username, getSubscriptionModesForUser(username), ScrapeJob.SOURCE_USER);
            scrapeJobRunner.kick();
            return ResponseEntity.ok("Scraping Task Sent");
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("Failed to Send Scraping Task");
        }
    }

    public ResponseEntity<String> addArticleForUser(String username, String articleLink, String articleTitle) {
        try {
            User user = userRepository.findByUsername(username).orElseThrow();
            user.addArticleForUser(articleLink, articleTitle);
            userRepository.save(user);
            return ResponseEntity.ok("Article saved");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Failed to save article");
        }
    }

    public ResponseEntity<String> removeArticleForUser(String username, String articleURL){
        try {
            User user = userRepository.findByUsername(username).orElseThrow();
            user.removeArticleForUser(articleURL);
            userRepository.save(user);
            return ResponseEntity.ok("Article removed");
        } catch(Exception e){return ResponseEntity.status(500).body("Failed to remove article");
}
    }

    public ResponseEntity<String> deleteAllUsers() {
        try {
            userRepository.deleteAll();
            return ResponseEntity.ok("All users deleted");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Failed to delete all users");
        }
    }

    public List<String> listUserKeywords(String username) {
        User user = userRepository.findByUsername(username).orElseThrow();
        return user.getKeywords();
    }

    public ResponseEntity<String> addUserKeyword(String username, String keyword){
        try {
            User user =userRepository.findByUsername(username).orElseThrow();
            user.addKeywords(keyword);
            userRepository.save(user);
            return ResponseEntity.ok("User Keyword Added");
        } catch(Exception e){return ResponseEntity.status(500).body("Failed to save user keyword");}
    }

    public ResponseEntity<String> removeUserKeyword(String username, String keyword){
        try {
            User user =userRepository.findByUsername(username).orElseThrow();
            user.removeKeyword(keyword);
            userRepository.save(user);
            return ResponseEntity.ok("User Keyword Removed");
        } catch(Exception e){return ResponseEntity.status(500).body("Failed to remove user keyword");}
    }

    public ResponseEntity<String> saveUserActivity(UserActivityDTO userActivity) {
        try {
            User user = userRepository.findByUsername(userActivity.getUsername()).orElseThrow();
            userActivity.getActivity().forEach((link, score) ->
                userActivityRepository.upsertActivity(user.getId(), link, score));

            // Marks TODAY active, independent of the per-article upserts above. This is
            // deliberately its own row rather than something read back out of
            // user_activity - see UserActiveDay for why that table can't answer "which
            // days was this user active" on its own. Only fires when the flush actually
            // contains an article; an empty batch proves nothing about today.
            if (!userActivity.getActivity().isEmpty()) {
                userActiveDayRepository.markActive(user.getId(), java.time.LocalDate.now());
            }

            try {
                profileService.applyActivity(user.getId(), userActivity.getActivity());
            } catch (Exception e) {
                // Caught here, not left to propagate: this whole method is @Transactional,
                // so an uncaught exception here would roll back the activity upsert above
                // too. Swallowing it (after logging) is what keeps profiling best-effort.
                log.warn("Failed to update personalization profile for user {}", user.getUsername(), e);
            }

            return ResponseEntity.ok("Activity recorded");
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("Failed to save user activity");
        }
    }

    public List<UserActivity> fetchUserActivity(String username){
        User user = userRepository.findByUsername(username).orElseThrow();
        return userActivityRepository.findByUser(user);
    }

    public ResponseEntity<String> deleteAllActivity() {
        try {
            userActivityRepository.deleteAll();
            return ResponseEntity.ok("Activity table cleared");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Failed to clear activity table");
        }
    }




}
