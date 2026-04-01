package com.rohil_verma.organization_api.postgres_stuff;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;

@Service
public class DynamoService{


    @Autowired
    private LinksService linksService;
    
    @Autowired
    private DynamoDbClient dynamoDbClient;



    public Map<String, List<Map<String, Map<String, String>>>> getUserContent(String username){
        List<String> userWebsites= linksService.getWebsitesForUser(username);
        
        List<Map<String,AttributeValue>> keys = userWebsites.stream().map(
            website -> Map.of(
                "websiteURLs", AttributeValue.builder().s(website).build()
            )).toList();

        Map<String,List<Map<String,Map<String,String>>>> returnMap = new HashMap<>();

        for (String website : userWebsites) {
            QueryRequest request = QueryRequest.builder()
            .tableName("MyScrapingHandlerTable")
            .keyConditionExpression("websiteURLs = :pk")
            .expressionAttributeValues(Map.of(
                ":pk", AttributeValue.builder().s(website).build()
            ))
            .build();

        

            QueryResponse response = dynamoDbClient.query(request);

            for (Map<String,AttributeValue> articles : response.items()){
                if (articles.get("title") == null || articles.get("summary") == null 
    || articles.get("date") == null || articles.get("articleText") == null) continue;
                Map<String,Map<String,String>> article = new HashMap<String,Map<String,String>>();

                Map<String,String> articleContents = new HashMap<>();

                articleContents.put("date",articles.get("date").s());
                articleContents.put("link",articles.get("SK").s());
                articleContents.put("summary",articles.get("summary").s());
                article.put(articles.get("title").s(), articleContents);
                returnMap.computeIfAbsent(articles.get("websiteURLs").s(), k -> new ArrayList<>()).add(article);
        }}
        return returnMap;
    }



}