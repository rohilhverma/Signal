package com.rohil_verma.organization_api;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.context.annotation.Bean;
import org.springframework.http.ResponseEntity;

import com.rohil_verma.organization_api.postgres_stuff.UserRepository;
import com.rohil_verma.organization_api.postgres_stuff.LinksService;
import com.rohil_verma.organization_api.postgres_stuff.User;

@SpringBootApplication
@EnableAsync
public class OrganizationApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(OrganizationApiApplication.class, args);
	}

	@Bean
	CommandLineRunner commandLineRunner(UserRepository userRepository, LinksService linksService) {
		return args -> {
			if(userRepository.count() == 0){
				User rohil = new User("rohil", "rohil@gmail.com");
				rohil.addSubscription("https://theverge.com", null);
				rohil.addSubscription("https://arstechnica.com", null);
				rohil.addSubscription("https://techcrunch.com", null);
				rohil.addSubscription("https://www.wired.com", null);
				rohil.addSubscription("https://www.engadget.com", null);
				rohil.addSubscription("https://www.zdnet.com", null);
				rohil.addSubscription("https://www.tomshardware.com", null);
				rohil.addSubscription("https://www.bleepingcomputer.com", null);
				rohil.addSubscription("https://9to5mac.com", null);
				rohil.addSubscription("https://www.androidauthority.com", null);
				userRepository.save(rohil);
				ResponseEntity<String> x = linksService.sendScrapingTask("rohil");
				System.out.println(x.getStatusCode());
			} else {
				ResponseEntity<String> x = linksService.sendScrapingTask("rohil");
			}
		};
	
	}
}

