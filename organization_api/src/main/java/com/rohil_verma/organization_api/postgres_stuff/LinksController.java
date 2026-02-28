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

    @GetMapping("/links/id")
    public List<String> WebsitesForUser(@RequestParam String param) {
        return linksService.getWebsitesForUser(param);
    }

    @GetMapping("/websites/all")
    public List<String> AllWebsites(@RequestParam String param) {
        return linksService.getWebsites();
    }

    @PostMapping("/user")
    public ResponseEntity<String> AddUser(@RequestBody LinksDatabase entity) {        
        return linksService.saveUser(entity);
    }

    @GetMapping("/user/info")
    public UserInformationDTO GetUserInformation(@RequestBody String entity) {  
    return linksService.getUserInformation(entity);
    }

    @DeleteMapping("/user")
    public ResponseEntity<String> DeleteUser(@RequestBody LinksDatabase entity){
        return linksService.deleteUser(entity);
    }

    @DeleteMapping("/user/url")
    public void deleteWebsiteForUser(@RequestBody LinksDatabase withWebsite) {
        linksService.deleteWebsiteForUser(withWebsite);
    }




    
    
    




    
    


}
