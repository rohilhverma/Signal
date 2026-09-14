package com.rohil_verma.organization_api.Personalization;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

/**
 * Same approach as {@code UserActivityRepositoryUpsertTest}: the literal SQL is pulled
 * off {@link UserScoreRepository#upsertScoreDelta} via reflection and run with plain
 * JDBC against a scratch temp table, no Spring context involved.
 *
 * <p>The behaviour under test is the opposite merge rule from user_activity's upsert:
 * this one accumulates ({@code score_val + delta}), it does not take a max. Worth
 * pinning down explicitly since it is easy to copy-paste the wrong one from the other.
 */
class UserScoreRepositoryUpsertTest {

    private static final String URL = "jdbc:postgresql://localhost:5432/postgres";
    private static final String USER = "rohilverma";
    private static final String PASSWORD = System.getenv().getOrDefault("PGPASSWORD", "");

    private Connection conn;

    @BeforeEach
    void setUp() throws SQLException {
        try {
            conn = DriverManager.getConnection(URL, USER, PASSWORD);
        } catch (SQLException e) {
            conn = null;
            assumeTrue(false, "local Postgres not reachable: " + e.getMessage());
            return;
        }
        try (Statement st = conn.createStatement()) {
            st.execute("""
                CREATE TEMP TABLE user_scores (
                    user_id integer,
                    word_key varchar(255),
                    score_val integer,
                    display_label varchar(255),
                    hit_count integer,
                    updated_at timestamp,
                    primary key (user_id, word_key)
                )
                """);
        }
    }

    @AfterEach
    void tearDown() throws SQLException {
        if (conn != null) {
            conn.close();
        }
    }

    @Test
    void accumulatesTheDeltaRatherThanOverwriting() throws Exception {
        upsert(1, "nvidia", 3, null);
        upsert(1, "nvidia", 2, null);

        assertEquals(5, currentScore(1, "nvidia"));

        upsert(1, "nvidia", 10, null);
        assertEquals(15, currentScore(1, "nvidia"));
    }

    @Test
    void tracksEachTermSeparately() throws Exception {
        upsert(1, "nvidia", 3, null);
        upsert(1, "openai", 4, null);

        assertEquals(3, currentScore(1, "nvidia"));
        assertEquals(4, currentScore(1, "openai"));
    }

    /**
     * hit_count counts articles, not interaction strength, so it climbs by exactly one per
     * call however large the delta is — that is what makes it a number the Stats page can
     * label "articles".
     */
    @Test
    void countsOneHitPerCallRegardlessOfDeltaSize() throws Exception {
        upsert(1, "nvidia", 40, null);
        assertEquals(1, currentInt(1, "nvidia", "hit_count"));

        upsert(1, "nvidia", 1, null);
        upsert(1, "nvidia", 1, null);
        assertEquals(3, currentInt(1, "nvidia", "hit_count"));
    }

    /**
     * The COALESCE direction is the whole point: a prose-tokenized term arrives with a null
     * label and must not blank out a good one, while a tagged article backfills a row that
     * has none.
     */
    @Test
    void keepsAStoredLabelAgainstNullAndBackfillsAMissingOne() throws Exception {
        upsert(1, "openai", 3, "OpenAI");
        upsert(1, "openai", 3, null);
        assertEquals("OpenAI", currentLabel(1, "openai"));

        upsert(1, "nvidia", 3, null);
        assertNull(currentLabel(1, "nvidia"));

        upsert(1, "nvidia", 3, "Nvidia");
        assertEquals("Nvidia", currentLabel(1, "nvidia"));
    }

    private static String upsertSql() throws NoSuchMethodException {
        Method m = UserScoreRepository.class.getMethod(
            "upsertScoreDelta", Integer.class, String.class, Integer.class, String.class);
        return m.getAnnotation(Query.class).value()
            .replace(":userId", "?")
            .replace(":wordKey", "?")
            .replace(":delta", "?")
            .replace(":displayLabel", "?");
    }

    private void upsert(int userId, String wordKey, int delta, String displayLabel) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(upsertSql())) {
            ps.setInt(1, userId);
            ps.setString(2, wordKey);
            ps.setInt(3, delta);
            ps.setString(4, displayLabel);
            ps.executeUpdate();
        }
    }

    private int currentScore(int userId, String wordKey) throws SQLException {
        return currentInt(userId, wordKey, "score_val");
    }

    private int currentInt(int userId, String wordKey, String column) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "select " + column + " from user_scores where user_id = ? and word_key = ?")) {
            ps.setInt(1, userId);
            ps.setString(2, wordKey);
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next(), "expected a row for user " + userId + " / " + wordKey);
                return rs.getInt(1);
            }
        }
    }

    private String currentLabel(int userId, String wordKey) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "select display_label from user_scores where user_id = ? and word_key = ?")) {
            ps.setInt(1, userId);
            ps.setString(2, wordKey);
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next(), "expected a row for user " + userId + " / " + wordKey);
                return rs.getString(1);
            }
        }
    }
}
