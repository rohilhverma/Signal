package com.rohil_verma.organization_api.Website;

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
import org.springframework.web.bind.annotation.RestController;

import com.rohil_verma.organization_api.Articles.ArticleService;
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
