package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;

import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@RestController
@RequestMapping("/")
@CrossOrigin(origins = "http://localhost:3000")
public class LinksController {


    @Autowired
    private DynamoService dynamoService;

    @Autowired
    private LinksService linksService;


    @GetMapping("/links/user")
    public List<String> WebsitesForUser(@RequestParam String username) {
        return linksService.getWebsitesForUser(username);
    }

    @GetMapping("/websites/all")
    public List<String> AllWebsites() {
        return linksService.getWebsites();
    }

    @PostMapping("/user")
    public ResponseEntity<String> AddUser(@RequestBody UserRequest request) {
        return linksService.addUser(request.getUsername(), request.getEmail(), request.getWebsiteURL(),
            request.getWebsiteContentMode());
    }

    @GetMapping("/user/info")
    public UserInformationDTO GetUserInformation(@RequestParam String username) {
        return linksService.getUserInformation(username);
    }

    @DeleteMapping("/user")
    public ResponseEntity<String> DeleteUser(@RequestParam String username) {
        return linksService.deleteUser(username);
    }

    @DeleteMapping("/user/url")
    public void deleteWebsiteForUser(@RequestBody UserRequest request) {
        System.out.println("username: " + request.getUsername() + " url: " + request.getWebsiteURL());

        linksService.deleteWebsiteForUser(request.getUsername(), request.getWebsiteURL());
    }

    @PostMapping("/user/task")
    public ResponseEntity<String> SendScrapingTask(@RequestBody UserRequest request) {
        return linksService.sendScrapingTask(request.getUsername());
    }

    @GetMapping("/user/website")
    public Map<String, WebsiteContent> returnUserContent(@RequestParam String username) {
        return dynamoService.getUserContent(username);
    }

    @PostMapping("/user/website")
    public ResponseEntity<String> addWebsiteForUser(@RequestBody UserRequest request) {
        ResponseEntity<String> response= linksService.addWebsiteForUser(request.getUsername(), request.getWebsiteURL(), request.getWebsiteContentMode());
        System.out.println(response + "\n\n" + request.getUsername() + "\n" + request.getWebsiteURL() + "\n");
        return response;
    }

    @GetMapping("/user/website/cache")
    public ConcurrentMap<String, @NonNull String> getMethodName() {
        return dynamoService.cacheContent();
    }
    
    @PostMapping("/user/url/resummarization")
    public String resummarize(@RequestBody UserRequest request) throws Exception {
        String result = dynamoService.resummarizeRequest(request.getWebsiteURL(), request.getWebsiteContentMode());
        dynamoService.updateSummary(request.getWebsiteURL(), request.getWebsiteContentMode(), result);
        return result;
    }

    @GetMapping("/user/saved/articles")
    public Map<String, String> getSavedArticles(@RequestParam String username) {
        return linksService.userSavedArticles(username);
    }
    
    @PostMapping("/user/saved/articles")
    public ResponseEntity<String> saveArticleForUser(@RequestBody UserRequest request) {
        return linksService.addArticleForUser(request.getUsername(), request.getArticleLink(), request.getArticleTitle());
    }

    @DeleteMapping("/user/saved/articles")
    public ResponseEntity<String> deleteArticleForUser(@RequestBody UserRequest request) {
        return linksService.removeArticleForUser(request.getUsername(), request.getArticleLink());
    }
}