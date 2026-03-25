package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@RestController
@RequestMapping("/")
public class LinksController {

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
            request.getContentMode(), request.getWebsiteContentMode());
    }

    @GetMapping("/user/info")
    public UserInformationDTO GetUserInformation(@RequestParam String username) {
        return linksService.getUserInformation(username);
    }

    @DeleteMapping("/user")
    public ResponseEntity<String> DeleteUser(@RequestBody UserRequest request) {
        return linksService.deleteUser(request.getUsername());
    }

    @DeleteMapping("/user/url")
    public void deleteWebsiteForUser(@RequestBody UserRequest request) {
        linksService.deleteWebsiteForUser(request.getUsername(), request.getWebsiteURL());
    }

    @PostMapping("/user/task")
    public ResponseEntity<String> SendScrapingTask(@RequestBody UserRequest request) {
        return linksService.sendScrapingTask(request.getUsername());
    }
}
