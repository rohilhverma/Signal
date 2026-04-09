package com.rohil_verma.organization_api.postgres_stuff;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;

import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import org.springframework.scheduling.annotation.Async;
import static java.util.Map.entry;

import java.net.URI;

@Service
public class DynamoService{

    @Autowired
    private LinksService linksService;
    
    @Autowired
    private DynamoDbClient dynamoDbClient;

    @Autowired
    private GeminiModel geminiModel;

    private final HashMap<String,String> promptMap = new HashMap<String,String>(Map.ofEntries(
        entry("shorter","You are a news wire editor. Summarize each article in 2-3 bullet points. Each bullet must be one sentence, maximum 20 words. Bullet 1: What happened — the core event, stated as a fact. Bullet 2: Who is involved and what specifically they did. Bullet 3 (only if needed): A key number or outcome that adds value. Rules: No filler phrases like \"it's worth noting\" or \"according to\"; No background or history unless critical to understanding the event; If a bullet doesn't add new information, cut it; Start each bullet with the subject, not a verb. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\"."),
        entry("default","You are a news briefing editor. For each article, write a single paragraph summary of 4-6 sentences. Each summary must include: 1. The core event — what happened, stated directly; 2. Context — how this connects to related events or industry trends; 3. Implication — what this signals or why it matters going forward; 4. Key specifics — include relevant numbers, names, and concrete details. Write in a flowing paragraph, not bullet points. Do not use filler phrases. State facts directly with no editorializing. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\"."),
        entry("longer","You are a senior analyst writing intelligence briefings. For each article, write a detailed analysis in 2-3 paragraphs, separated by blank lines.\n\nThe first paragraph covers what happened: who was involved, concrete specifics, relevant numbers, names, dates, and technical details found in the article.\n\nThe second paragraph (only if the article provides it) explains context: using ONLY information found within the article, how this event connects to related developments, competing efforts, or previous events mentioned. Do not reference any information outside of the provided text. If the article does not provide broader context, skip this paragraph entirely.\n\nThe third paragraph (only if the article supports it) covers implications: based ONLY on what the article states or directly implies, what does this signal going forward. Do not speculate beyond what the text supports. If the article does not discuss implications, skip this paragraph entirely.\n\nRules:\n- Each paragraph MUST be separated by a blank line\n- Do NOT include any labels, headers, or bracket markers like [PARAGRAPH 1] before paragraphs\n- Include specific numbers, names, and data points\n- Draw connections ONLY between details within the article\n- No filler phrases or editorializing\n- Never introduce outside knowledge\n- Every sentence must be traceable to the article text\n\nReturn ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".")    
    ));

    private Cache<String,String> articleTextCache = Caffeine.newBuilder()
    .expireAfterWrite(1,TimeUnit.DAYS)
    .build();

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
            String siteName="";
            List<Map<String, Map<String, String>>> articleList = new ArrayList<>();

            for (Map<String,AttributeValue> item : response.items()){
                AttributeValue sk=item.get("SK");
                if (sk != null && "RSS".equals(sk.s())) {
                    AttributeValue paywall = item.get("paywall");
                    AttributeValue siteNameAttribute = item.get("siteName");
                    paywallStatus = paywall != null ? String.valueOf(paywall.bool()) : null;
                    siteName = siteNameAttribute != null ? siteNameAttribute.s() : "";
                    continue;
                }

                if (item.get("title") == null || item.get("summary") == null|| item.get("date") == null || item.get("articleText") == null) continue;

                List<AttributeValue> summaryList = item.get("summary").l();
                Map<String, String> articleContents = new HashMap<>();
                articleContents.put("date", item.get("date").s());
                articleContents.put("link", item.get("SK").s());
                articleContents.put("summaryDefault", summaryList.size() > 1 ? summaryList.get(1).s() : "");
                articleContents.put("summaryShort",   summaryList.size() > 0 ? summaryList.get(0).s() : "");
                articleContents.put("summaryLong",    summaryList.size() > 2 ? summaryList.get(2).s() : "");
                Map<String, Map<String, String>> article = new HashMap<>();
                article.put(item.get("title").s(), articleContents);
                articleList.add(article);
                articleTextCache.put(item.get("SK").s(),item.get("articleText").s());
            }
            returnMap.put(website, new WebsiteContent(paywallStatus, siteName,articleList));
        }
        return returnMap;
    }

    public ConcurrentMap<String, @NonNull String> cacheContent(){
        return articleTextCache.asMap();
    }

    @Async
    public void updateSummary(String url, String mode, String resummarization) throws Exception {
        String host = new URI(url).getHost().replaceFirst("^www\\.", "");
        String pk = "https://" + host;
        int index = mode.equals("shorter") ? 0 : mode.equals("default") ? 1 : 2;
        UpdateItemRequest request = UpdateItemRequest.builder()
            .tableName("MyScrapingHandlerTable")
            .key(Map.of(
                "websiteURLs", AttributeValue.builder().s(pk).build(),
                "SK", AttributeValue.builder().s(url).build()
            ))
            .updateExpression("SET summary[" + index + "] = :resummarization")
            .expressionAttributeValues(Map.of(
                ":resummarization", AttributeValue.builder().s(resummarization).build()
            ))
            .build();
        dynamoDbClient.updateItem(request);
    }

    public String resummarizeRequest(String url, String mode){
        String articleText = articleTextCache.getIfPresent(url);
        if (articleText == null) return "Cache miss: call /user/website first to warm the cache for this URL.";
        return geminiModel.handleResummarize(promptMap.get(mode), articleText);
    }
    

}
