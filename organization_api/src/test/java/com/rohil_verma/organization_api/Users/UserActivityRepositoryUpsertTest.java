package com.rohil_verma.organization_api.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
 * No Spring context, no repository proxy: this pulls the literal SQL straight off the
 * {@code @Query} annotation on {@link UserActivityRepository#upsertActivity} via
 * reflection and runs it with plain JDBC against a scratch temp table on the local
 * Postgres instance (same credentials as {@code application.properties}). Testing the
 * actual annotated text, not a hand-retyped copy of it, is what this test is for: it
 * fails the moment the merge semantics of the real query change, not just when this
 * file's SQL drifts out of sync with it.
 *
 * <p>Skips itself if the local Postgres from LOCAL_ARCHITECTURE.md is not reachable,
 * rather than failing the build on a machine without it.
 */
class UserActivityRepositoryUpsertTest {

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
                CREATE TEMP TABLE user_activity (
                    id serial primary key,
                    user_id integer,
                    article_link varchar(2048),
                    score integer,
                    created_at timestamp,
                    unique (user_id, article_link)
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
    void keepsTheGreaterScoreInsteadOfOverwriting() throws Exception {
        upsert(1, "https://example.com/a", 4);
        upsert(1, "https://example.com/a", 1); // lower score must not win

        assertEquals(4, currentScore(1, "https://example.com/a"));

        upsert(1, "https://example.com/a", 9); // higher score must win
        assertEquals(9, currentScore(1, "https://example.com/a"));
    }

    @Test
    void insertsASeparateRowPerUserArticlePair() throws Exception {
        upsert(1, "https://example.com/a", 4);
        upsert(2, "https://example.com/a", 7);

        assertEquals(4, currentScore(1, "https://example.com/a"));
        assertEquals(7, currentScore(2, "https://example.com/a"));
    }

    private static String upsertSql() throws NoSuchMethodException {
        Method m = UserActivityRepository.class.getMethod(
            "upsertActivity", Integer.class, String.class, Integer.class);
        return m.getAnnotation(Query.class).value()
            .replace(":userId", "?")
            .replace(":articleLink", "?")
            .replace(":score", "?");
    }

    private void upsert(int userId, String link, int score) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(upsertSql())) {
            ps.setInt(1, userId);
            ps.setString(2, link);
            ps.setInt(3, score);
            ps.executeUpdate();
        }
    }

    private int currentScore(int userId, String link) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "select score from user_activity where user_id = ? and article_link = ?")) {
            ps.setInt(1, userId);
            ps.setString(2, link);
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next(), "expected a row for user " + userId + " / " + link);
                return rs.getInt(1);
            }
        }
    }
}
