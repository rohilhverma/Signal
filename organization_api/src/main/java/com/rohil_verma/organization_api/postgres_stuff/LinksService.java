package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

@Service
public class LinksService {
    
    @Autowired
    private LinksRepository linksRepository;

    public List<String> getWebsitesForUser(String param){
        return linksRepository.findUniqueLinksByUsername(param);
    }

    public List<String> getWebsites(){
        return linksRepository.findAllWebsites();
    }

    public ResponseEntity<String> saveUser(LinksDatabase user){ 
        try {
            linksRepository.save(user);
            return ResponseEntity.ok("User Saved");
        } catch(Exception e){
            return ResponseEntity.status(500).body("Failed to Upload User!");
        }
            }

    public UserInformationDTO getUserInformation(String username){
        try{ 
            Integer id = linksRepository.findUserIdFromUsername(username);
            List<String> websites = linksRepository.findUniqueLinksByUsername(username);
            return new UserInformationDTO(id, username, websites);
        } catch(Exception e){
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


}
