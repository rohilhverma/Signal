package com.rohil_verma.organization_api;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.context.annotation.Bean;
import org.springframework.http.ResponseEntity;

import com.rohil_verma.organization_api.postgres_stuff.UserRepository;
import com.rohil_verma.organization_api.postgres_stuff.LinksService;

@SpringBootApplication
@EnableAsync
public class OrganizationApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(OrganizationApiApplication.class, args);
	}

	@Bean
	CommandLineRunner commandLineRunner(UserRepository userRepository, LinksService linksService) {
		// return args -> {
		// 	if (userRepository.count() == 0) {
		// 		// rohil: "short" across all sites, techcrunch overridden to "analytics"
		// 		User rohil = new User("rohil", "rohil@gmail.com");
		// 		rohil.setContentMode("short");
		// 		rohil.addSubscription("https://theverge.com", null);
		// 		rohil.addSubscription("https://arstechnica.com", null);
		// 		rohil.addSubscription("https://techcrunch.com", "analytics");
		// 		userRepository.save(rohil);

		// 		// sarah: no default, each site has its own mode
		// 		User sarah = new User("sarah_k", "sarah@outlook.com");
		// 		sarah.addSubscription("https://nytimes.com", "long");
		// 		sarah.addSubscription("https://bbc.com", "short");
		// 		userRepository.save(sarah);

		// 		// mike: "default" across all, one override
		// 		User mike = new User("dev_mike", "mike@proton.me");
		// 		mike.setContentMode("default");
		// 		mike.addSubscription("https://github.blog", "analytics");
		// 		mike.addSubscription("https://stackoverflow.blog", null);
		// 		mike.addSubscription("https://hackernews.com", null);
		// 		userRepository.save(mike);

		// 		// jenny: "long" across all
		// 		User jenny = new User("jenny_w", "jenny@yahoo.com");
		// 		jenny.setContentMode("long");
		// 		jenny.addSubscription("https://medium.com", null);
		// 		userRepository.save(jenny);

		// 		System.out.println("--- Data Seeded Successfully ---");
		// 	} else {
				System.out.println("--- Data already exists ---");
				ResponseEntity<String> x = linksService.sendScrapingTask("rohil");
				// System.out.println(x.getStatusCode());
		// 	};
		return args -> {};
		};
	}

