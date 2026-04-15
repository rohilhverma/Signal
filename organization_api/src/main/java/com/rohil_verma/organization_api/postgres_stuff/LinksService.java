package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.rohil_verma.organization_api.MessageSender;
import com.rohil_verma.organization_api.UserActivity;

@Service
@Transactional
public class LinksService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private UserActivityRepository userActivityRepository;

    @Autowired
    private MessageSender messageSender;


    public List<String> getWebsitesForUser(String username) {
        return userRepository.findByUsername(username)
            .map(user -> user.getSubscriptions().keySet().stream().toList())
            .orElse(List.of());
    }

    public List<String> getWebsites() {
        return subscriptionRepository.findAll().stream()
            .map(Subscription::getWebsiteURL)
            .distinct()
            .toList();
    }


    public ResponseEntity<String> addWebsiteForUser(String username,  String websiteURL,String contentMode){
        try {
            User currentUser = userRepository.findByUsername(username).orElseThrow();
            currentUser.addSubscription(websiteURL,contentMode);
            userRepository.save(currentUser);
            return ResponseEntity.ok("New Source " + websiteURL + " added to user: " + username);
    } catch (Exception e){return ResponseEntity.status(500).body("Failed to Upload Source");}}

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
        userRepository.findByUsername(username).ifPresent(user -> {
            user.getSubscriptions().remove(websiteURL);
            userRepository.save(user);
        });
    }

    public ResponseEntity<String> addUser(String username, String email, String websiteURL,
                                          String websiteContentMode) {
        try {
            User user = userRepository.findByUsername(username).orElseGet(() -> {
                User newUser = new User(username, email);
                return userRepository.save(newUser);
            });
            if (websiteContentMode == null) {
                return ResponseEntity.badRequest()
                    .body("A website content mode is required");
            }
            user.addSubscription(websiteURL, websiteContentMode);
            userRepository.save(user);
            List<String> websites = user.getSubscriptions().keySet().stream().toList();
            messageSender.sendScrapingTaskToWorkers(username, websites);
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
            List<String> websites = getWebsitesForUser(username);
            System.out.println(websites);
            messageSender.sendScrapingTaskToWorkers(username, websites);
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
