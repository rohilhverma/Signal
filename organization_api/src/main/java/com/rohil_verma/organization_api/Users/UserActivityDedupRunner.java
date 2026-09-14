package com.rohil_verma.organization_api.Users;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * One-off, idempotent cleanup for {@code user_activity} rows written before the
 * (user_id, article_link) unique constraint existed on that table.
 *
 * <p>{@code spring.jpa.hibernate.ddl-auto=update} will not add a unique constraint to a
 * table that already has duplicate rows under that key — Hibernate just skips it (or
 * errors, depending on version) without failing the boot. Left alone, that is a silent
 * trap: the constraint quietly never shows up, {@link UserActivityRepository#upsertActivity}
 * keeps working (ON CONFLICT only needs the constraint to exist, which on a fresh
 * database it does), but a database carried over from before this change stays exposed
 * to the constraint add failing forever.
 *
 * <p>This runs on every boot, after the context (and Hibernate's own schema update) has
 * fully started, and deletes duplicate rows down to one per (user_id, article_link) —
 * keeping the highest score, which is also what the upsert's merge rule uses. On a
 * database that already has no duplicates this deletes zero rows.
 *
 * <p>Ordering note: because this runs after Hibernate's schema update rather than
 * before it, the very first boot after this migration ships may still fail to add the
 * constraint (duplicates are only cleaned up afterwards, by this runner). The
 * constraint add is retried by Hibernate on every subsequent boot, so the second boot
 * onward succeeds. This is intentional — it avoids the harder problem of running our
 * own SQL ahead of Hibernate's schema step — but it does mean a freshly migrated,
 * never-before-run database needs two application starts before the constraint is
 * actually enforced in the schema. The upsert query itself does not require the
 * constraint to already be enforced in order to compile or run against a clean table.
 */
@Component
public class UserActivityDedupRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UserActivityDedupRunner.class);

    @Autowired
    private UserActivityRepository userActivityRepository;

    @Override
    public void run(ApplicationArguments args) {
        try {
            int deleted = userActivityRepository.dedupeKeepingMaxScore();
            if (deleted > 0) {
                log.info("user_activity dedup: removed {} duplicate row(s), kept max score per (user, article)", deleted);
            } else {
                log.debug("user_activity dedup: no duplicates found");
            }
        } catch (Exception e) {
            // Never block application startup over this. Worst case the unique
            // constraint stays missing for another boot cycle.
            log.warn("user_activity dedup failed to run", e);
        }
    }
}
