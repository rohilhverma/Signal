package com.rohil_verma.organization_api.DynamoDB;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;

/**
 * The feed projection has to alias {@code date}, because DynamoDB treats it as a reserved word.
 *
 * <p>Written after the fact: the unaliased projection was accepted by review, compiled, passed
 * {@code node --check} on the Lambda side, and then failed on the first live read with
 * "Invalid ProjectionExpression: Attribute name is a reserved keyword; reserved keyword: date".
 * Nothing caught it because no test ever looked at the request the repository builds - the Java
 * suite mocked DynamoDB nowhere. These two tests assert the request instead of the response, which
 * is where the bug was.
 */
class DynamoArticleRepositoryProjectionTest {

    private static final String SITE = "www.example.com";
    private static final String TABLE = "MyScrapingHandlerTable";

    private final DynamoDbClient client = mock(DynamoDbClient.class);

    private DynamoArticleRepository repository() {
        when(client.query(any(QueryRequest.class)))
            .thenReturn(QueryResponse.builder().items(List.of()).build());
        DynamoArticleRepository repository = new DynamoArticleRepository(client);
        ReflectionTestUtils.setField(repository, "tableName", TABLE);
        return repository;
    }

    /** The one Query the repository issued, so the request itself can be asserted on. */
    private QueryRequest capturedQuery() {
        ArgumentCaptor<QueryRequest> captor = ArgumentCaptor.forClass(QueryRequest.class);
        verify(client).query(captor.capture());
        return captor.getValue();
    }

    private static List<String> projectionTokens(QueryRequest request) {
        return List.of(request.projectionExpression().split(", "));
    }

    @Test
    void feedProjectionAliasesTheReservedDateAttribute() {
        repository().findFeedArticles(List.of(SITE), null);

        QueryRequest request = capturedQuery();
        List<String> tokens = projectionTokens(request);

        assertTrue(tokens.contains(DynamoArticleRepository.DATE_ALIAS),
            "the feed projection must reference the date alias, not the attribute name");
        assertFalse(tokens.contains(DynamoArticleRepository.A_DATE),
            "a bare 'date' in a ProjectionExpression is rejected as a reserved keyword");
        assertEquals(DynamoArticleRepository.A_DATE,
            request.expressionAttributeNames().get(DynamoArticleRepository.DATE_ALIAS),
            "the alias must resolve to the attribute the reader looks up afterwards");
    }

    @Test
    void countProjectionSendsNoUnusedAlias() {
        repository().countArticlesPerSite(List.of(SITE), null);

        QueryRequest request = capturedQuery();
        assertFalse(projectionTokens(request).contains(DynamoArticleRepository.DATE_ALIAS),
            "the count projection is sort-key only and needs no alias");
        assertFalse(request.expressionAttributeNames().containsKey(DynamoArticleRepository.DATE_ALIAS),
            "an ExpressionAttributeNames entry no expression uses is itself an error");
    }
}
