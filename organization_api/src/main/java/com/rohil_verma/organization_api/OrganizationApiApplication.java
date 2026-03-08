package com.rohil_verma.organization_api;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import com.rohil_verma.organization_api.postgres_stuff.LinksDatabase;
import com.rohil_verma.organization_api.postgres_stuff.LinksRepository;
import com.rohil_verma.organization_api.postgres_stuff.LinksService;

@SpringBootApplication
public class OrganizationApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(OrganizationApiApplication.class, args);
	}

	@Bean
	CommandLineRunner commandLineRunner(LinksRepository repository, LinksService linksService) {
		return args -> {
			if (repository.count() == 0) {
				repository.save(LinksDatabase.userSignIn("rohil", "rohil@gmail.com", "https://google.com"));
				repository.save(LinksDatabase.userSignIn("rohil", "rohil@gmail.com", "https://facebook.com"));
				repository.save(LinksDatabase.userSignIn("rohil", "rohil@gmail.com", "https://techcrunch.com"));

				// User 2 - sarah, news junkie
				repository.save(LinksDatabase.userSignIn("sarah_k", "sarah@outlook.com", "https://nytimes.com"));
				repository.save(LinksDatabase.userSignIn("sarah_k", "sarah@outlook.com", "https://bbc.com"));

				// User 3 - dev_mike, tech focused
				repository.save(LinksDatabase.userSignIn("dev_mike", "mike@proton.me", "https://github.blog"));
				repository.save(LinksDatabase.userSignIn("dev_mike", "mike@proton.me", "https://stackoverflow.blog"));
				repository.save(LinksDatabase.userSignIn("dev_mike", "mike@proton.me", "https://hackernews.com"));

				// User 4 - jenny, single site
				repository.save(LinksDatabase.userSignIn("jenny_w", "jenny@yahoo.com", "https://medium.com"));

				System.out.println("--- Data Seeded Successfully ---");
			} else {
				System.out.println("--- Data already exists ---");
				linksService.sendScrapingTask(LinksDatabase.withWebsite("rohil", null));
			};
			// repository.findAll().forEach(x -> System.out.println(x));
		};
		}}
