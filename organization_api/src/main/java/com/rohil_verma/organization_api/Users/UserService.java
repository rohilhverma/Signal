package com.rohil_verma.organization_api.Users;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.rohil_verma.organization_api.Jobs.ScrapeJob;
import com.rohil_verma.organization_api.Jobs.ScrapeJobRunner;
import com.rohil_verma.organization_api.Jobs.ScrapeJobService;
import com.rohil_verma.organization_api.UserActivity;

@Service
@Transactional
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private UserActivityRepository userActivityRepository;

    @Autowired
    private ScrapeJobService scrapeJobService;

    @Autowired
    private ScrapeJobRunner scrapeJobRunner;

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
     * Website URL to the subscription's content mode, for callers that need to act on the
     * per-source mode rather than just the list of sites.
     */
    public Map<String, String> getSubscriptionModesForUser(String username) {
        return userRepository.findByUsername(username)
            .map(user -> user.getSubscriptions().entrySet().stream()
                .collect(Collectors.toMap(
                    Map.Entry::getKey,
                    entry -> entry.getValue().getContentMode() == null ? "" : entry.getValue().getContentMode()
                )))
            .orElse(Map.of());
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
            userActivity.getActivity().forEach((link, score) -> {
                UserActivity activity = new UserActivity();
                activity.setUser(user);
                activity.setArticleLink(link);
                activity.setScore(score);
                System.out.println(activity);
                userActivityRepository.save(activity);
            });
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
