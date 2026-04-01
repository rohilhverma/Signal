package com.rohil_verma.organization_api.postgres_stuff;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

@Configuration
public class DynamoDBConfig {
    
    @Bean
    DynamoDbClient dynamoDBClient(){
        DynamoDbClient client = DynamoDbClient.builder().region(Region.US_EAST_2).build();
        return client;
    }

    
     
}
