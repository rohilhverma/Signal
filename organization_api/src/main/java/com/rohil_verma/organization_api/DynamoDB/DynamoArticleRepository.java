package com.rohil_verma.organization_api.DynamoDB;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

@Repository
public class DynamoArticleRepository {

    static final String PK = "websiteURLs";
    static final String SK = "SK";
    static final String SITE_SK = "RSS";
    static final String LINK_INDEX = "link-index";

    
    private static final String ARTICLE_SK_PREFIX = "http";

    static final String A_LINK = "link";
    static final String A_TITLE = "title";
    
    static final String A_SUMMARY_SHORT = "summary_short";
    static final String A_SUMMARY_DEFAULT = "summary_default";
    static final String A_SUMMARY_LONG = "summary_long";
    static final String A_ARTICLE_TEXT = "articleText";
    static final String A_DATE = "date";
    static final String A_PROCESSED_AT = "processedAt";
    static final String A_PAYWALL = "paywall";
    static final String A_SITE_NAME = "siteName";
    static final String A_TOPICS = "topics";
    static final String A_WORD_COUNT = "word_count";


    static final int SLOT_SHORTER = 0;
    static final int SLOT_DEFAULT = 1;
    static final int SLOT_LONGER = 2;

    static final String DATE_ALIAS = "#date";

    private static final String FEED_PROJECTION =
        SK + ", " + PK + ", " + A_TITLE + ", " + A_SUMMARY_SHORT + ", " + A_SUMMARY_DEFAULT + ", "
        + A_SUMMARY_LONG + ", " + DATE_ALIAS + ", " + A_PROCESSED_AT + ", " + A_TOPICS + ", "
        + A_WORD_COUNT + ", " + A_LINK;

    private final DynamoDbClient dynamoDbClient;

    @Value("${aws.dynamodb.table-name:MyScrapingHandlerTable}")
    private String tableName;

    public DynamoArticleRepository(DynamoDbClient dynamoDbClient) {
        this.dynamoDbClient = dynamoDbClient;
    }

    /** Site-level row: what the dashboard shows as a source's name and paywall flag. */
    public record SiteMeta(String siteName, Boolean paywall) {}

    /** Everything a term profile needs from the article an interaction points at. */
    public record TermSource(String title, String summaryDefault, String topics) {}

    private List<Map<String, AttributeValue>> querySite(
            String siteKey, Instant cutoff, String projection) {
        Map<String, AttributeValue> values = new HashMap<>();
        values.put(":site", AttributeValue.fromS(siteKey));
        values.put(":articlePrefix", AttributeValue.fromS(ARTICLE_SK_PREFIX));
        if (cutoff != null) {
            values.put(":cutoff", AttributeValue.fromS(cutoff.toString()));
        }

        QueryRequest.Builder builder = QueryRequest.builder()
            .tableName(tableName)
            .keyConditionExpression(PK + " = :site AND begins_with(" + SK + ", :articlePrefix)")
            .projectionExpression(projection)
            .expressionAttributeValues(values);
        // Only the feed projection aliases an attribute, and DynamoDB rejects an
        // ExpressionAttributeNames entry that no expression uses - so this is conditional
        // rather than always supplied.
        if (projection.contains(DATE_ALIAS)) {
            builder.expressionAttributeNames(Map.of(DATE_ALIAS, A_DATE));
        }
        if (cutoff != null) {
            builder.filterExpression(A_PROCESSED_AT + " >= :cutoff");
        }
        return dynamoDbClient.query(builder.build()).items();
    }

    private Optional<Map<String, AttributeValue>> getItem(String siteKey, String sortKey) {
        GetItemRequest request = GetItemRequest.builder()
            .tableName(tableName)
            .key(Map.of(PK, AttributeValue.fromS(siteKey), SK, AttributeValue.fromS(sortKey)))
            .build();
        Map<String, AttributeValue> item = dynamoDbClient.getItem(request).item();
        return item == null || item.isEmpty() ? Optional.empty() : Optional.of(item);
    }

    private static List<String> distinct(Collection<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(v -> v != null && !v.isBlank()).distinct().toList();
    }

    static String stringOf(AttributeValue value) {
        return value == null ? null : value.s();
    }

    private static String articleLink(Map<String, AttributeValue> item) {
        return stringOf(item.get(SK));
    }

    private static Long longOf(AttributeValue value) {
        if (value == null) return null;
        if (value.n() != null) {
            try { return Long.valueOf(value.n()); } catch (NumberFormatException ignored) { }
        }
        if (value.s() != null) {
            try { return Long.valueOf(value.s().trim()); } catch (NumberFormatException ignored) { }
        }
        return null;
    }


    private static Instant instantOf(AttributeValue value) {
        String raw = stringOf(value);
        if (raw == null || raw.isBlank()) return null;
        try {
            return Instant.parse(raw.trim());
        } catch (RuntimeException e) {
            return null;
        }
    }


    static String summaryText(Map<String, AttributeValue> item, String attribute) {
        return stringOf(item.get(attribute));
    }


    static String summaryAttribute(int slot) {
        return switch (slot) {
            case SLOT_SHORTER -> A_SUMMARY_SHORT;
            case SLOT_LONGER -> A_SUMMARY_LONG;
            default -> A_SUMMARY_DEFAULT;
        };
    }

    static String topicsOf(Map<String, AttributeValue> item) {
        AttributeValue topics = item.get(A_TOPICS);
        if (topics == null) return null;
        if (topics.l() != null) {
            return topics.l().stream()
                .map(AttributeValue::s)
                .filter(t -> t != null && !t.isBlank())
                .map(String::trim)
                .reduce((a, b) -> a + "," + b)
                .orElse("");
        }
        return stringOf(topics);
    }

    private static Boolean boolOf(AttributeValue value) {
        if (value == null) return null;
        if (value.bool() != null) return value.bool();
        if (value.s() != null) return Boolean.valueOf(value.s());
        return null;
    }
    public List<FeedArticle> findFeedArticles(Collection<String> siteKeys, Instant cutoff) {
        List<FeedArticle> articles = new ArrayList<>();
        for (String site : distinct(siteKeys)) {
            for (Map<String, AttributeValue> item : querySite(site, cutoff, FEED_PROJECTION)) {
                if (SITE_SK.equals(stringOf(item.get(SK)))) continue;
                String link = articleLink(item);
                String title = stringOf(item.get(A_TITLE));
                if (link == null || title == null) continue;

                Instant processedAt = instantOf(item.get(A_PROCESSED_AT));
                if (cutoff != null && (processedAt == null || processedAt.isBefore(cutoff))) {
                    continue;
                }
                Long words = longOf(item.get(A_WORD_COUNT));
                articles.add(new FeedArticle(
                    site, link, title,
                    summaryText(item, A_SUMMARY_SHORT),
                    summaryText(item, A_SUMMARY_DEFAULT),
                    summaryText(item, A_SUMMARY_LONG),
                    words == null ? null : words.intValue(),
                    stringOf(item.get(A_DATE)),
                    processedAt,
                    topicsOf(item)));
            }
        }
        articles.sort(Comparator.comparing(FeedArticle::getProcessedAt,
            Comparator.nullsLast(Comparator.naturalOrder())).reversed());
        return articles;
    }

    public Map<String, Integer> countArticlesPerSite(Collection<String> siteKeys, Instant cutoff) {
        Map<String, Integer> counts = new HashMap<>();
        for (String site : distinct(siteKeys)) {
            int count = 0;
            for (Map<String, AttributeValue> item : querySite(site, cutoff, SK)) {
                if (!SITE_SK.equals(stringOf(item.get(SK)))) count++;
            }
            counts.put(site, count);
        }
        return counts;
    }


    public Map<String, SiteMeta> findSiteMeta(Collection<String> siteKeys) {
        Map<String, SiteMeta> meta = new HashMap<>();
        for (String site : distinct(siteKeys)) {
            getItem(site, SITE_SK).ifPresent(item -> meta.put(site, new SiteMeta(
                stringOf(item.get(A_SITE_NAME)), boolOf(item.get(A_PAYWALL)))));
        }
        return meta;
    }

    private Optional<Map<String, AttributeValue>> findByLink(String link) {
        if (link == null || link.isBlank()) return Optional.empty();

        QueryResponse response = dynamoDbClient.query(QueryRequest.builder()
            .tableName(tableName)
            .indexName(LINK_INDEX)
            .keyConditionExpression(A_LINK + " = :link")
            .expressionAttributeValues(Map.of(":link", AttributeValue.fromS(link)))
            .limit(1)
            .build());

        for (Map<String, AttributeValue> indexItem : response.items()) {
            String site = stringOf(indexItem.get(PK));
            String sortKey = stringOf(indexItem.get(SK));
            if (site == null || sortKey == null) continue;
            Optional<Map<String, AttributeValue>> item = getItem(site, sortKey);
            if (item.isPresent()) return item;
        }
        return Optional.empty();
    }


    public Optional<TermSource> findTermSourceByLink(String link) {
        return findByLink(link).map(item -> new TermSource(
            stringOf(item.get(A_TITLE)),
            summaryText(item, A_SUMMARY_DEFAULT),
            topicsOf(item)));
    }


    public Optional<String> findArticleText(String link) {
        return findByLink(link).map(item -> stringOf(item.get(A_ARTICLE_TEXT)));
    }

    public void updateSummarySlot(String siteKey, String link, int slot, String summary) {
        if (siteKey == null || link == null || summary == null) return;
        dynamoDbClient.updateItem(UpdateItemRequest.builder()
            .tableName(tableName)
            .key(Map.of(PK, AttributeValue.fromS(siteKey), SK, AttributeValue.fromS(link)))
            .updateExpression("SET " + summaryAttribute(slot) + " = :summary")
            .expressionAttributeValues(Map.of(":summary", AttributeValue.fromS(summary)))
            .build());
    }
}
