package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import com.rohil_verma.organization_api.MessageSender;

@Service
public class LinksService {
    
    @Autowired
    private LinksRepository linksRepository;

    @Autowired
    private MessageSender messageSender;

    public List<String> getWebsitesForUser(String username){
        return linksRepository.findUniqueLinksByUsername(username);
    }

    public List<String> getWebsites(){
        return linksRepository.findAllWebsites();
    }

    public UserInformationDTO getUserInformation(String username){
        try{ 
            String email = linksRepository.findUserEmailFromUsername(username);
            List<String> websites = linksRepository.findUniqueLinksByUsername(username);
            return new UserInformationDTO(email, username, websites);
        } catch(Exception e){
            e.printStackTrace();  
            return new UserInformationDTO(null,null, null);
         }
    }

    public ResponseEntity<String> deleteUser(LinksDatabase user) {
        try {
            linksRepository.delete(user);
            return ResponseEntity.ok("User Deleted");
        } catch(Exception e){
            return ResponseEntity.status(500).body("Failed to Delete User");
        }
    }

    public void deleteWebsiteForUser(LinksDatabase withWebsite){
        try {
            linksRepository.deleteByUsernameAndWebsiteURL(withWebsite.getUsername(), withWebsite.getWebsiteURL());
        } catch(Exception e){
            System.out.println("Failed to Delete Website");
        }
    }

    public ResponseEntity<String> addUser(LinksDatabase user){
        try{
            linksRepository.save(user);
            List<String> websites = linksRepository.findUniqueLinksByUsername(user.getUsername());
            messageSender.sendScrapingTaskToWorkers(user.getUsername(), websites);
            return ResponseEntity.ok("User Saved");
        } catch(Exception e){
            return ResponseEntity.status(500).body("Failed to Save User");
        }
    }

    public ResponseEntity<String> sendScrapingTask(LinksDatabase user){
        try{
            List<String> websites = linksRepository.findUniqueLinksByUsername(user.getUsername());
            messageSender.sendScrapingTaskToWorkers(user.getUsername(), websites);
            return ResponseEntity.ok("Scraping Task Sent");
        } catch(Exception e){
            return ResponseEntity.status(500).body("Failed to Send Scraping Task");
        }
    }


}
