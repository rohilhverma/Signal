package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.rohil_verma.organization_api.MessageSender;

@Service
@Transactional
public class LinksService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private MessageSender messageSender;


    public List<String> getWebsitesForUser(String username) {
        return userRepository.findByUsername(username)
            .map(user -> user.getSubscriptions().stream()
                .map(Subscription::getWebsiteURL)
                .toList())
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
                user.getSubscriptions().stream()
                    .map(Subscription::getWebsiteURL)
                    .toList()))
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
        userRepository.findByUsername(username).ifPresent(user ->
            subscriptionRepository.deleteByUserAndWebsiteURL(user, websiteURL));
    }

    public ResponseEntity<String> addUser(String username, String email, String websiteURL,
                                          String contentMode, String websiteContentMode) {
        try {
            User user = userRepository.findByUsername(username).orElseGet(() -> {
                User newUser = new User(username, email);
                return userRepository.save(newUser);
            });
            if (contentMode != null) {
                user.setContentMode(contentMode);
            }
            String broadProfile = user.getContentMode();
            if (broadProfile == null && websiteContentMode == null) {
                return ResponseEntity.badRequest()
                    .body("Either a broad content profile or a website content profile is required");
            }
            user.addSubscription(websiteURL, websiteContentMode);
            userRepository.save(user);
            List<String> websites = user.getSubscriptions().stream()
                .map(Subscription::getWebsiteURL)
                .toList();
            messageSender.sendScrapingTaskToWorkers(username, websites);
            return ResponseEntity.ok("User Saved");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Failed to Save User");
        }
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
}
