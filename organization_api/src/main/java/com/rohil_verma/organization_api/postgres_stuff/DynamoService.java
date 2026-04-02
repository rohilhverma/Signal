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



    public Map<String, WebsiteContent> getUserContent(String username){
        List<String> userWebsites= linksService.getWebsitesForUser(username);

        Map<String, WebsiteContent> returnMap = new HashMap<>();

        for (String website : userWebsites) {
            QueryRequest request = QueryRequest.builder()
            .tableName("MyScrapingHandlerTable")
            .keyConditionExpression("websiteURLs = :pk")
            .expressionAttributeValues(Map.of(
                ":pk", AttributeValue.builder().s(website).build()
            ))
            .build();

            QueryResponse response = dynamoDbClient.query(request);
            String paywallStatus = null;
            List<Map<String, Map<String, String>>> articleList = new ArrayList<>();

            for (Map<String,AttributeValue> item : response.items()){
                AttributeValue sk=item.get("SK");
                if (sk != null && "RSS".equals(sk.s())) {
                    AttributeValue paywall = item.get("paywall");
                    paywallStatus = paywall != null ? String.valueOf(paywall.bool()) : null;
                    continue;
                }

                if (item.get("title") == null || item.get("summary") == null|| item.get("date") == null || item.get("articleText") == null) continue;

                Map<String, String> articleContents = new HashMap<>();
                articleContents.put("date", item.get("date").s());
                articleContents.put("link", item.get("SK").s());
                articleContents.put("summary", item.get("summary").s());

                Map<String, Map<String, String>> article = new HashMap<>();
                article.put(item.get("title").s(), articleContents);
                articleList.add(article);
            }

            returnMap.put(website, new WebsiteContent(paywallStatus, articleList));
        }
        return returnMap;
    }



}