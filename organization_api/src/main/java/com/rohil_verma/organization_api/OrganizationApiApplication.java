package com.rohil_verma.organization_api;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import com.rohil_verma.organization_api.postgres_stuff.LinksDatabase;
import com.rohil_verma.organization_api.postgres_stuff.LinksRepository;
@SpringBootApplication
public class OrganizationApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(OrganizationApiApplication.class, args);
	}

	@Bean
	CommandLineRunner commandLineRunner(LinksRepository repository) {
		return args -> {
			if (repository.count() == 0) {
				repository.save(LinksDatabase.withWebsite("rohil", "https://google.com"));
				repository.save(LinksDatabase.withWebsite("rohil", "https://facebook.com"));
				repository.save(LinksDatabase.withWebsite("other_user", "https://twitter.com"));
				System.out.println("--- Data Seeded Successfully ---");
			} else {
				System.out.println("--- Data already exists ---");
			}
			repository.findAll().forEach(x -> System.out.println(x));
		};
	}
	
}
