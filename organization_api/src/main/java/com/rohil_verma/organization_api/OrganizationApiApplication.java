package com.rohil_verma.organization_api;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.context.annotation.Bean;
import com.rohil_verma.organization_api.Users.UserRepository;
import com.rohil_verma.organization_api.Users.UserService;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class OrganizationApiApplication {
	public static void main(String[] args) {
		SpringApplication.run(OrganizationApiApplication.class, args);
	}

	@Bean
	CommandLineRunner commandLineRunner(UserRepository userRepository, UserService userService) {
		return args -> {
		};
	
	}
}

